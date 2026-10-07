FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements-serve.txt .
RUN pip install -r requirements-serve.txt

COPY params.yaml .
COPY src ./src
# Модель кладётся в образ на этапе сборки (CI делает `dvc repro` перед docker build)
COPY models ./models

ARG MODEL_VERSION=dev
ENV MODEL_VERSION=${MODEL_VERSION}

RUN useradd -m app && mkdir -p /app/logs && chown -R app /app
USER app

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s \
  CMD python -c "import urllib.request as u; u.urlopen('http://localhost:8000/health', timeout=2)"

CMD ["uvicorn", "src.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
