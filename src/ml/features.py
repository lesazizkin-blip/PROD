"""Препроцессинг и сборка пайплайна. Менять здесь: новые признаки, кодирование, модель."""

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from src.ml.config import load_params


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    """Признаки из выводов EDA. Вызывается и при обучении, и в API - логика одна и та же."""
    feats = load_params()["features"]
    df = df.copy()
    # Пропуски в категориях -> "unknown" (так же ведёт себя ONNX-версия модели)
    for col in feats["categorical"]:
        if col in df:
            df[col] = df[col].astype(object).where(df[col].notna(), "unknown")
    for col in feats["numeric"]:
        if col in df:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    if {"skills_count", "experience_years"} <= set(df.columns):
        df["skills_per_year"] = df["skills_count"] / (df["experience_years"].fillna(0) + 1)
    return df


EXTRA_NUMERIC = ["skills_per_year"]


def build_preprocessor(numeric: list[str], categorical: list[str]) -> ColumnTransformer:
    num = Pipeline([("imputer", SimpleImputer(strategy="median"))])
    cat = Pipeline([("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False))])
    return ColumnTransformer(
        [("num", num, numeric + EXTRA_NUMERIC), ("cat", cat, categorical)],
        verbose_feature_names_out=False,
    )


def build_pipeline(params: dict, quantile: float | None = None) -> Pipeline:
    """Пайплайн = препроцессинг + модель. quantile=None -> обычная регрессия (MSE)."""
    feats, mp = params["features"], params["model"]
    model = HistGradientBoostingRegressor(
        loss="quantile" if quantile is not None else "squared_error",
        quantile=quantile,
        max_iter=mp["max_iter"],
        learning_rate=mp["learning_rate"],
        max_depth=mp["max_depth"],
        min_samples_leaf=mp["min_samples_leaf"],
        random_state=params["data"]["seed"],
    )
    return Pipeline(
        [("prep", build_preprocessor(feats["numeric"], feats["categorical"])), ("model", model)]
    )
