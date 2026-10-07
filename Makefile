.PHONY: setup data eda train onnx repro test lint fmt api mlflow load docker up clean

PY := .venv/bin/python
export MLFLOW_DISABLE_AGENT_HINT := 1

setup:  ## виртуальное окружение + зависимости
	python3 -m venv .venv
	.venv/bin/pip install -U pip
	.venv/bin/pip install -r requirements-dev.txt

data:  ## демо-данные (если data/raw/dataset.csv ещё нет)
	$(PY) -m src.ml.make_demo_data

eda:  ## графики и статистика -> reports/eda
	$(PY) -m src.ml.eda

train:  ## обучение + логирование в MLflow
	$(PY) -m src.ml.train

onnx:  ## экспорт в ONNX + бенчмарк
	$(PY) -m src.ml.export_onnx

repro:  ## весь пайплайн одной командой (DVC)
	.venv/bin/dvc repro

test:  ## тесты + покрытие
	.venv/bin/pytest --cov=src --cov-report=term-missing

lint:
	.venv/bin/ruff check . && .venv/bin/ruff format --check .

fmt:
	.venv/bin/ruff check . --fix && .venv/bin/ruff format .

api:  ## API с автоперезагрузкой, Swagger на :8000/docs
	.venv/bin/uvicorn src.app.main:app --reload

mlflow:  ## UI экспериментов на :5000
	.venv/bin/mlflow ui --backend-store-uri sqlite:///mlflow.db --port 5000

load:  ## нагрузочный тест (API должен быть запущен)
	$(PY) scripts/load_test.py --requests 500 --concurrency 20

docker:  ## собрать образ (сначала make repro)
	docker build -t prod-ml-api:latest .

up:
	docker compose up -d --build

clean:
	rm -rf mlruns mlflow.db logs .pytest_cache .ruff_cache .coverage htmlcov
