"""Точка входа. Swagger: /api/docs, OpenAPI: /api/openapi.json"""

import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.db import SessionLocal
from app.errors import AppError
from app.logging_setup import log, setup_logging
from app.reference_data import ensure_reference_data
from app.routers import assistant, auth, boxes, health, projects, reference
from app.static_site import mount_site

settings = get_settings()
logger = setup_logging(settings.log_level)


@asynccontextmanager
async def lifespan(app: FastAPI):
    with SessionLocal() as db:
        ensure_reference_data(db)
    if settings.seed_demo:
        from app.seed import run as seed_demo

        seed_demo()
    log(logger, "startup")
    yield


app = FastAPI(
    title="MoverMate API",
    version="1.0.0",
    description="Переезд без хаоса: проекты и задачи, коробки и вещи, поиск, этикетки, прогресс. Вход по логину и паролю (cookie-сессия), проект видят только его участники.",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
    lifespan=lifespan,
)


def _internal_error(request_id: str) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={"detail": "Внутренняя ошибка", "code": "internal_error", "request_id": request_id},
    )


# Порядок важен: эта прослойка добавлена РАНЬШЕ CORS, поэтому лежит внутри неё. Ответ 500, который она
# формирует, проходит через CORS и получает его заголовки; иначе браузер показывает CORS-ошибку вместо 500.
@app.middleware("http")
async def access_log(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    request.state.request_id = request_id
    t0 = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception as exc:
        # Стек пишем в лог с request_id; клиенту отдаём только id - по нему находим запись в логах
        log(
            logger,
            "unhandled_exception",
            level=logging.ERROR,
            request_id=request_id,
            path=request.url.path,
            error=repr(exc),
        )
        logger.exception("traceback", extra={"extra_fields": {"request_id": request_id}})
        response = _internal_error(request_id)
    response.headers["x-request-id"] = request_id
    log(
        logger,
        "request",
        request_id=request_id,
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        latency_ms=round((time.perf_counter() - t0) * 1000, 2),
    )
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["x-request-id"],
)


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message, "code": exc.code, "request_id": request.state.request_id},
    )


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    errors = [
        {"field": ".".join(str(p) for p in e["loc"][1:]), "message": e["msg"]} for e in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content={
            "detail": "Некорректные данные",
            "code": "validation_failed",
            "errors": errors,
            "request_id": request.state.request_id,
        },
    )


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception):
    # Запасной путь: основную работу делает access_log (с CORS-заголовками)
    return _internal_error(getattr(request.state, "request_id", "-"))


api = APIRouter(prefix="/api")
api.include_router(health.router)
api.include_router(auth.router)
api.include_router(reference.router)
api.include_router(projects.router)
api.include_router(boxes.router)
api.include_router(assistant.router)
app.include_router(api)

if settings.static_dir and not mount_site(app, settings.static_dir):
    logger.warning("STATIC_DIR задан, но index.html там не найден: сайт не подключён")
