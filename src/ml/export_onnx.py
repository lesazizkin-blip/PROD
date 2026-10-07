"""Экспорт медианной модели в ONNX + сравнение скорости/точности с sklearn (критерий P3).

Запуск: python -m src.ml.export_onnx
"""

import json
import time

import joblib
import numpy as np
import onnxruntime as ort
import pandas as pd
from skl2onnx import to_onnx
from skl2onnx.common.data_types import FloatTensorType, StringTensorType

from src.ml.config import MODELS_DIR, REPORTS_DIR, ROOT, load_params
from src.ml.features import add_features


def _initial_types(schema: dict) -> list:
    types = []
    for col in schema["numeric"] + ["skills_per_year"]:
        types.append((col, FloatTensorType([None, 1])))
    for col in schema["categorical"]:
        types.append((col, StringTensorType([None, 1])))
    return types


def run() -> dict:
    params = load_params()
    bundle = joblib.load(MODELS_DIR / "model.joblib")
    schema = json.loads((MODELS_DIR / "schema.json").read_text())
    pipe = bundle["models"][bundle["median_q"]]

    onx = to_onnx(
        pipe, initial_types=_initial_types(schema), target_opset={"": 17, "ai.onnx.ml": 3}
    )
    (MODELS_DIR / "model.onnx").write_bytes(onx.SerializeToString())

    df = add_features(pd.read_csv(ROOT / params["data"]["raw_path"]).dropna(subset=["salary"]))
    X = df[schema["features"] + ["skills_per_year"]].head(1000)

    sess = ort.InferenceSession(str(MODELS_DIR / "model.onnx"))
    feed = {c: X[[c]].to_numpy(dtype=np.float32) for c in schema["numeric"] + ["skills_per_year"]}
    feed.update({c: X[[c]].to_numpy(dtype=str) for c in schema["categorical"]})

    t0 = time.perf_counter()
    sk = pipe.predict(X)
    t_sk = time.perf_counter() - t0
    t0 = time.perf_counter()
    ox = sess.run(None, feed)[0].ravel()
    t_ox = time.perf_counter() - t0

    result = {
        "rows": len(X),
        "sklearn_ms": round(t_sk * 1000, 2),
        "onnx_ms": round(t_ox * 1000, 2),
        "speedup": round(t_sk / t_ox, 2),
        "max_abs_diff": float(np.max(np.abs(sk - ox))),
    }
    REPORTS_DIR.mkdir(exist_ok=True)
    (REPORTS_DIR / "onnx_benchmark.json").write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    run()
