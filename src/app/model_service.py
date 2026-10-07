"""Загрузка модели и инференс. Один экземпляр на процесс."""

import json
import os
from pathlib import Path

import joblib
import pandas as pd

from src.ml.config import MODELS_DIR
from src.ml.features import add_features


class ModelService:
    def __init__(self, models_dir: Path = MODELS_DIR) -> None:
        self.models_dir = models_dir
        self.bundle: dict | None = None
        self.schema: dict = {}
        self.version = os.getenv("MODEL_VERSION", "dev")

    def load(self) -> None:
        self.bundle = joblib.load(self.models_dir / "model.joblib")
        self.schema = json.loads((self.models_dir / "schema.json").read_text())

    @property
    def loaded(self) -> bool:
        return self.bundle is not None

    def predict(self, rows: list[dict]) -> list[dict]:
        if not self.loaded:
            raise RuntimeError("model is not loaded")
        assert self.bundle is not None
        df = add_features(pd.DataFrame(rows))
        X = df[self.schema["features"] + ["skills_per_year"]]
        # Препроцессинг у всех квантильных моделей одинаковый - считаем один раз
        models = self.bundle["models"]
        Xt = models[self.bundle["median_q"]].named_steps["prep"].transform(X)
        preds = {q: m.named_steps["model"].predict(Xt) for q, m in models.items()}
        qs = self.bundle["quantiles"]
        med = preds[self.bundle["median_q"]]
        out = []
        for i in range(len(df)):
            item = {"prediction": float(med[i]), "low": None, "high": None}
            if len(qs) >= 2:
                lo, hi = sorted((float(preds[qs[0]][i]), float(preds[qs[-1]][i])))
                # квантильные модели обучаются независимо и могут пересекаться
                item["low"] = min(lo, item["prediction"])
                item["high"] = max(hi, item["prediction"])
            out.append(item)
        return out
