import pandas as pd
from src.ml.features import add_features
from src.ml.train import split_data


def test_model_beats_baseline(trained):
    _, metrics = trained
    assert metrics["test"]["mae"] < metrics["baseline"]["mae"]
    assert metrics["test"]["r2"] > 0.5


def test_interval_is_reported(trained):
    _, metrics = trained
    assert 0.4 < metrics["test"]["interval_coverage"] <= 1.0


def test_split_has_no_overlap(demo_df):
    params = {"data": {"test_size": 0.2, "val_size": 0.2, "seed": 1}}
    train, val, test = split_data(demo_df, params)
    assert len(train) + len(val) + len(test) == len(demo_df)
    assert set(train.index).isdisjoint(val.index)
    assert set(train.index).isdisjoint(test.index)
    assert set(val.index).isdisjoint(test.index)


def test_add_features_fills_missing_categories():
    df = pd.DataFrame({"role": ["qa", None], "skills_count": [4, 2], "experience_years": [1, None]})
    out = add_features(df)
    assert out["role"].tolist() == ["qa", "unknown"]
    assert out["skills_per_year"].notna().all()


def test_artifacts_saved(trained):
    models_dir, _ = trained
    for name in ("model.joblib", "schema.json", "metrics.json"):
        assert (models_dir / name).exists()
