# Один образ: собранный сайт (React) и API (FastAPI) на одном порту. Сборка из корня репозитория:
#   docker build -t movermate .
# Для деплоя по шаблону организаторов (Kaniko в CI) нужен именно Dockerfile в корне.

# ---- 1. сайт
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- 2. сервер
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

COPY backend/requirements.txt backend/constraints.txt ./
# constraints.txt фиксирует версии: свежий релиз зависимости не сломает сборку посреди хакатона
RUN pip install -r requirements.txt -c constraints.txt

COPY backend/alembic.ini .
COPY backend/alembic ./alembic
COPY backend/app ./app
COPY --from=web /web/dist ./site

# База SQLite лежит в /data (том): данные переживают пересоздание контейнера
RUN useradd -m app && mkdir -p /data && chown -R app /data /app
USER app
ENV STATIC_DIR=/app/site DATABASE_URL=sqlite:////data/app.db

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s \
  CMD python -c "import urllib.request as u; u.urlopen('http://localhost:8000/api/health', timeout=2)"

# Миграции применяются при каждом старте: схема БД всегда соответствует коду
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
