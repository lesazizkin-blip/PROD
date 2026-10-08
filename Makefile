.PHONY: setup backend-setup frontend-setup db seed api web test lint fmt build up down logs

backend-setup:
	cd backend && python3 -m venv .venv && .venv/bin/pip install -U pip && .venv/bin/pip install -r requirements-dev.txt

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
