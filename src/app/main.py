"""FastAPI-сервис. Swagger: /docs. Запуск: uvicorn src.app.main:app --reload"""

import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request

from src.app.model_service import ModelService
from src.app.observability import Metrics, log_event, setup_logging
from src.app.schemas import (
    BatchRequest,
    BatchResponse,
    HealthResponse,
    PredictRequest,
    PredictResponse,
)

logger = setup_logging()
service = ModelService()
metrics = Metrics()


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        service.load()
        log_event(logger, event="model_loaded", version=service.version)
    except FileNotFoundError:
        log_event(logger, event="model_missing", hint="run `make train`")
    yield


app = FastAPI(
    title="PROD Hackathon ML API",
    version="0.1.0",
    description="Сервис предсказания. Эндпоинты: /predict, /predict/batch, /health, /metrics.",
    lifespan=lifespan,
)


@app.middleware("http")
async def access_log(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    request.state.request_id = request_id
    t0 = time.perf_counter()
    status = 500
    try:
        response = await call_next(request)
        status = response.status_code
        response.headers["x-request-id"] = request_id
        return response
    finally:
        latency = (time.perf_counter() - t0) * 1000
        metrics.observe(latency, status)
        log_event(
            logger,
            event="request",
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            status=status,
            latency_ms=round(latency, 2),
        )


def _predict(items: list[PredictRequest], request_id: str) -> list[PredictResponse]:
    if not service.loaded:
        raise HTTPException(503, "Model is not loaded")
    rows = [i.model_dump() for i in items]
    t0 = time.perf_counter()
    try:
        results = service.predict(rows)
    except Exception as exc:  # noqa: BLE001
        log_event(logger, event="predict_error", request_id=request_id, error=repr(exc), input=rows)
        raise HTTPException(500, "Prediction failed") from exc
    log_event(
        logger,
        event="predict",
        request_id=request_id,
        n=len(rows),
        input=rows if len(rows) <= 5 else "batch",
        output=results if len(rows) <= 5 else "batch",
        model_version=service.version,
        inference_ms=round((time.perf_counter() - t0) * 1000, 2),
    )
    return [
        PredictResponse(**r, model_version=service.version, request_id=request_id) for r in results
    ]


@app.get("/health", response_model=HealthResponse, tags=["service"])
def health():
    return HealthResponse(status="ok", model_loaded=service.loaded, model_version=service.version)


@app.get("/metrics", tags=["service"])
def get_metrics():
    return metrics.snapshot()


@app.get("/model/info", tags=["service"])
def model_info():
    if not service.loaded:
        raise HTTPException(503, "Model is not loaded")
    return {"version": service.version, "schema": service.schema}


@app.post("/predict", response_model=PredictResponse, tags=["predict"])
def predict(body: PredictRequest, request: Request):
    return _predict([body], request.state.request_id)[0]


@app.post("/predict/batch", response_model=BatchResponse, tags=["predict"])
def predict_batch(body: BatchRequest, request: Request):
    return BatchResponse(predictions=_predict(body.items, request.state.request_id))
