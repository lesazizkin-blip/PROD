# PROD Hackathon — ML-шаблон

Готовый каркас под направление MLOps-инжиниринг: данные → EDA → обучение с трекингом → API → Docker → CI/CD.
Демо-кейс: оценка вилки зарплаты по резюме (на синтетических данных). Под настоящий кейс переделывается за пару часов, см. «Адаптация под кейс».

## Быстрый старт

```bash
make setup      # venv + зависимости
make data       # демо-датасет в data/raw/dataset.csv (если файла ещё нет)
make eda        # графики -> reports/eda/
make repro      # весь пайплайн: обучение + ONNX (DVC)
make test       # тесты + покрытие
make api        # API на :8000, Swagger: http://localhost:8000/docs
make mlflow     # эксперименты на :5000
make load       # нагрузочный тест (при запущенном API)
```

Пример запроса:

```bash
curl -X POST localhost:8000/predict -H 'content-type: application/json' \
  -d '{"role":"backend","region":"moscow","education":"bachelor","experience_years":3.5,"skills_count":8}'
```

## Структура

```
params.yaml          все параметры (признаки, гиперпараметры) — меняешь тут
dvc.yaml             пайплайн: train -> export_onnx
src/ml/              make_demo_data, eda, features, train, export_onnx
src/app/             FastAPI: main, schemas, model_service, observability
tests/               API и ML тесты
scripts/load_test.py нагрузочный тест
Dockerfile, docker-compose.yml
.github/workflows/ci.yml   lint -> dvc repro -> tests -> docker build + smoke -> deploy (по SSH)
docs/DEFENSE.md      шпаргалка к защите и «мини-правкам»
docs/ARCHITECTURE.md архитектура и принятые решения
```

## Чек-лист по критериям жюри (ML)

| Критерий | Баллы | Где в шаблоне |
|---|---|---|
| A. EDA и качество данных | 2 | `make eda`, `reports/eda/`; пропуски — импутация в `features.py`, выбросы — `clean()` в `train.py` |
| B. Воспроизводимость | 2 | Git + `requirements*.txt` + `params.yaml` + `dvc.yaml` |
| C. Качество модели | 3 | `train.py`: train/val/test, baseline, MAE/RMSE/R², покрытие интервала |
| D. Serving | 2 | FastAPI, `/predict`, `/predict/batch`, Swagger на `/docs` |
| E. Деплой | 1 | `deploy`-джоба в CI + Docker (см. «Деплой») |
| P1. Feature engineering, метрики | 0–2 | `add_features()`; обоснование метрик — в `docs/DEFENSE.md` |
| P2. Пайплайн и эксперименты | 0–2 | `dvc repro` одной командой; MLflow (`make mlflow`); DVC для данных/моделей |
| P3. Observability | 0–2 | JSON-логи с request_id и latency, `/metrics` (p50/p95/p99), ONNX-бенчмарк, `make load` |

## Адаптация под кейс (в день хакатона)

1. Положи данные в `data/raw/dataset.csv` (имя можно сменить в `params.yaml`).
2. `params.yaml`: `data.target`, `features.numeric`, `features.categorical`.
3. `python -m src.ml.eda` — посмотри данные, запиши выводы и гипотезы в `docs/DEFENSE.md`.
4. `src/ml/features.py` — добавь признаки из выводов EDA.
5. `src/app/schemas.py` — поля запроса под свои признаки (`Literal` для категорий).
6. **Классификация вместо регрессии:** в `features.py` замени `HistGradientBoostingRegressor` на `HistGradientBoostingClassifier`, в `train.py` — метрики на `f1`, `roc_auc`, `precision`, `recall`, а в `model_service.py` — `predict_proba`.
7. Данные большие (>50 МБ): `dvc add data/raw/dataset.csv`, настрой remote (`dvc remote add -d storage <url>`), коммить `.dvc`-файл.
8. `make repro && make test`, затем коммит и пуш — CI всё проверит.

## Деплой

Репозиторий уже умеет деплоить по SSH на любой сервер с Docker (CI собирает образ, передаёт `docker save | ssh docker load`, поднимает `docker compose`). Включение:

1. На сервере установлен Docker, у пользователя есть доступ к `docker`.
2. GitHub → Settings → Secrets and variables → Actions:
   - **Secrets:** `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` (приватный ключ, публичный — в `~/.ssh/authorized_keys` на сервере).
   - **Variables:** `DEPLOY_ENABLED` = `true`.
3. Пуш в `main` → через ~3–5 минут `http://<DEPLOY_HOST>:8000/docs`.

Без сервера: Render/Railway/Fly.io подключаются к репозиторию и собирают `Dockerfile` сами (перед этим модель должна лежать в `models/` — запусти `make repro` и закоммить `models/model.joblib`, либо настрой сборку через CI).

## Git-процесс на хакатоне

Ветка на каждую фичу → PR в `main` → CI зелёный → merge. Коммиты по-русски или по-английски, но осмысленные («add feature skills_per_year»), а не «fix».
