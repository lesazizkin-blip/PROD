"""Обучение: split train/val/test -> baseline -> модели по квантилям -> метрики -> MLflow.

Запуск: python -m src.ml.train   (или dvc repro)
Артефакты: models/model.joblib, models/metrics.json, models/schema.json
"""

import json

import joblib
import mlflow
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split

from src.ml.config import MODELS_DIR, ROOT, load_params
from src.ml.features import add_features, build_pipeline


def split_data(df: pd.DataFrame, params: dict):
    """train / val / test. Тест трогаем только для финальной оценки."""
    d = params["data"]
    train_val, test = train_test_split(df, test_size=d["test_size"], random_state=d["seed"])
    val_frac = d["val_size"] / (1 - d["test_size"])
    train, val = train_test_split(train_val, test_size=val_frac, random_state=d["seed"])
    return train, val, test


def regression_metrics(y_true, y_pred) -> dict:
    return {
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "rmse": float(np.sqrt(mean_squared_error(y_true, y_pred))),
        "r2": float(r2_score(y_true, y_pred)),
    }


def clean(df: pd.DataFrame, target: str) -> pd.DataFrame:
    """Пропуски в таргете убираем. Выбросы режем по квантилю (решение из EDA)."""
    df = df.dropna(subset=[target])
    return df[df[target] <= df[target].quantile(0.995)]


def run() -> dict:
    params = load_params()
    target = params["data"]["target"]
    quantiles = sorted(params["model"]["quantiles"])
    median_q = min(quantiles, key=lambda q: abs(q - 0.5))

    df = pd.read_csv(ROOT / params["data"]["raw_path"])
    df = clean(df, target)
    train, val, test = (add_features(x) for x in split_data(df, params))
    feats = params["features"]["numeric"] + params["features"]["categorical"]
    X_train, y_train = train[feats + ["skills_per_year"]], train[target]
    X_val, y_val = val[feats + ["skills_per_year"]], val[target]
    X_test, y_test = test[feats + ["skills_per_year"]], test[target]

    mlflow.set_tracking_uri(params["mlflow"]["tracking_uri"])
    mlflow.set_experiment(params["mlflow"]["experiment"])

    with mlflow.start_run():
        mlflow.log_params(
            {
                **{f"model.{k}": v for k, v in params["model"].items()},
                "data.seed": params["data"]["seed"],
                "data.rows": len(df),
            }
        )

        # Baseline: всегда предсказываем медиану train. Всё, что хуже - бесполезно.
        baseline_pred = np.full(len(y_test), y_train.median())
        baseline = regression_metrics(y_test, baseline_pred)

        models, preds = {}, {}
        for q in quantiles:
            pipe = build_pipeline(params, quantile=q)
            pipe.fit(X_train, y_train)
            models[q] = pipe
            preds[q] = pipe.predict(X_test)

        val_pred = models[median_q].predict(X_val)
        metrics = {
            "baseline": baseline,
            "val": regression_metrics(y_val, val_pred),
            "test": regression_metrics(y_test, preds[median_q]),
        }
        if len(quantiles) >= 2:
            lo, hi = preds[quantiles[0]], preds[quantiles[-1]]
            metrics["test"]["interval_coverage"] = float(np.mean((y_test >= lo) & (y_test <= hi)))
            metrics["test"]["interval_width"] = float(np.mean(hi - lo))

        for split in ("baseline", "val", "test"):
            for name, value in metrics[split].items():
                mlflow.log_metric(f"{split}_{name}", value)

        MODELS_DIR.mkdir(exist_ok=True)
        joblib.dump(
            {"quantiles": quantiles, "median_q": median_q, "models": models},
            MODELS_DIR / "model.joblib",
        )
        schema = {
            "features": feats,
            "numeric": params["features"]["numeric"],
            "categorical": params["features"]["categorical"],
            "categories": {
                c: sorted(df[c].dropna().unique().tolist())
                for c in params["features"]["categorical"]
            },
            "target": target,
        }
        (MODELS_DIR / "schema.json").write_text(json.dumps(schema, ensure_ascii=False, indent=2))
        (MODELS_DIR / "metrics.json").write_text(json.dumps(metrics, indent=2))
        mlflow.log_artifact(str(MODELS_DIR / "metrics.json"))
        mlflow.log_artifact(str(MODELS_DIR / "schema.json"))

    print(json.dumps(metrics, indent=2))
    return metrics


if __name__ == "__main__":
    run()
