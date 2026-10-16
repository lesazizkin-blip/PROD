.PHONY: mobile-setup ios phone android devices doctor dev tunnel preflight migration test-pg setup backend-setup frontend-setup db seed api web test lint fmt build up down logs

backend-setup:
	cd backend && python3 -m venv .venv && .venv/bin/pip install -U pip && .venv/bin/pip install -r requirements-dev.txt -c constraints.txt

frontend-setup:
	cd frontend && npm install

setup: backend-setup frontend-setup  ## окружение для бэкенда и фронтенда

db:  ## применить миграции (SQLite по умолчанию)
	cd backend && .venv/bin/alembic upgrade head

seed:  ## демо-пользователи и записи
	cd backend && .venv/bin/python -m app.seed

api:  ## бэкенд на :8000, Swagger: /api/docs
	cd backend && .venv/bin/uvicorn app.main:app --reload

web:  ## фронтенд на :5173 (проксирует /api на :8000)
	cd frontend && npm run dev

test:  ## тесты бэкенда + покрытие
	cd backend && .venv/bin/pytest --cov=app --cov-report=term-missing

lint:
	cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check .
	cd frontend && npm run lint && npx tsc -b

fmt:
	cd backend && .venv/bin/ruff check . --fix && .venv/bin/ruff format .

migration:  ## новая миграция: make migration m="add field"
	cd backend && .venv/bin/alembic revision --autogenerate -m "$(m)"

build:
	cd frontend && npm run build

up:  ## всё в Docker (Postgres + backend + nginx) на :8080
	docker compose up -d --build

down:
	docker compose down

logs:  ## общие логи всех сервисов
	docker compose logs -f --tail=100

preflight:  ## проверка стенда: make preflight URL=http://1.2.3.4
	scripts/preflight.sh $(or $(URL),http://localhost:8080)

tunnel:  ## аварийная публичная ссылка на локальный стек (:8080) через Docker (Mac и Linux); Ctrl+C - остановить
	docker run --rm -it --add-host=host.docker.internal:host-gateway cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://host.docker.internal:8080

test-pg:  ## тесты бэкенда на настоящем PostgreSQL (временный контейнер на :55432), включая гонку переходов
	-docker rm -f pgtest >/dev/null 2>&1
	docker run -d --name pgtest -e POSTGRES_USER=app -e POSTGRES_PASSWORD=app -e POSTGRES_DB=app -p 55432:5432 postgres:16-alpine >/dev/null
	@for i in $$(seq 1 30); do docker exec pgtest pg_isready -U app >/dev/null 2>&1 && break; sleep 1; done; sleep 2
	cd backend && TEST_DATABASE_URL=postgresql+psycopg://app:app@localhost:55432/app .venv/bin/pytest -rs; code=$$?; docker rm -f pgtest >/dev/null; exit $$code

mobile-setup:  ## зависимости мобильного приложения
	cd mobile && npm install

dev:  ## бэкенд для приложения: миграции, демо-данные, сервер на :8000
	cd backend && .venv/bin/alembic upgrade head && .venv/bin/python -m app.seed && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000

ios:  ## приложение в iOS-симуляторе (выбирает устройство сам; своё: make ios DEVICE="iPhone 17 Pro")
	scripts/mobile.sh ios "$(DEVICE)"

phone:  ## приложение на реальном телефоне через Expo Go по Wi-Fi (QR в терминале)
	scripts/mobile.sh phone

android:  ## приложение в Android-эмуляторе или на устройстве по USB
	scripts/mobile.sh android

devices:  ## на чём можно запустить: симуляторы, IP для телефона
	scripts/mobile.sh devices

doctor:  ## проверить окружение для запуска (Xcode, симуляторы, Android, бэкенд, сеть)
	scripts/mobile.sh doctor
