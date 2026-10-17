"""Точка входа. Swagger: /api/docs, OpenAPI: /api/openapi.json"""

import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from opentelemetry import trace
from opentelemetry.trace import StatusCode

from app.config import get_settings
from app.db import SessionLocal, engine
from app.errors import AppError, NotFoundError
from app.logging_setup import close_logging, log, setup_logging
from app.reference_data import ensure_reference_data
from app.routers import (
    ai_photo,
    assistant,
    auth,
    boxes,
    health,
    journey,
    projects,
    qr_codes,
    reference,
)
from app.static_site import mount_site
from app.throttle import WindowLimiter, client_ip
from app.tracing import current_ids, setup_tracing

settings = get_settings()
logger = setup_logging(
    settings.log_level, settings.app_env, settings.sage_logs_url, settings.sage_api_key
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    with SessionLocal() as db:
        ensure_reference_data(db)
    if settings.seed_demo:
        from app.seed import run as seed_demo

        seed_demo()
    log(
        logger,
        "startup",
        message="MoverMate запущен",
        sage_appender=bool(settings.sage_logs_url and settings.sage_api_key),
        sage_traces=bool(settings.sage_traces_endpoint and settings.sage_api_key),
    )
    yield
    log(logger, "shutdown", message="MoverMate остановлен")
    tracer_provider.shutdown()  # досылает накопленные спаны
    close_logging()


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


api_limiter = WindowLimiter(settings.api_requests_per_minute, 60)
register_limiter = WindowLimiter(settings.registrations_per_hour, 3600)


# Защита от флуда. Объявлена до access_log, поэтому лежит внутри неё: отказ 429 попадает в журнал запросов.
@app.middleware("http")
async def throttle(request: Request, call_next):
    path = request.url.path
    if path.startswith("/api/") and path != "/api/health":
        ip = client_ip(request)
        blocked = None
        if api_limiter.limit and not api_limiter.hit(ip):
            blocked = api_limiter
        elif (
            request.method == "POST"
            and path == "/api/auth/register"
            and register_limiter.limit
            and not register_limiter.hit(ip)
        ):
            blocked = register_limiter
        if blocked is not None:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Слишком много запросов с вашего адреса. Подождите немного.",
                    "code": "too_many_requests",
                    "request_id": getattr(request.state, "request_id", None),
                },
                headers={"Retry-After": str(blocked.retry_after())},
            )
    return await call_next(request)


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
        # Одна запись со стеком и request_id; клиенту отдаём только id - по нему находим запись в логах
        span = trace.get_current_span()
        span.record_exception(exc)
        span.set_status(StatusCode.ERROR, type(exc).__name__)
        logger.error(
            "unhandled_exception",
            exc_info=exc,
            extra={
                "extra_fields": {
                    "message": f"{request.method} {request.url.path} → 500: необработанная ошибка "
                    f"{type(exc).__name__}: {str(exc)[:300]}",
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "error": repr(exc)[:500],
                }
            },
        )
        response = _internal_error(request_id)
    response.headers["x-request-id"] = request_id
    ids = current_ids()
    if ids:
        response.headers["x-trace-id"] = ids[0]
    status = response.status_code
    # уровень по ответу: 5xx - ошибка сервера, 4xx - ошибка запроса клиента, остальное - обычная запись
    level = logging.ERROR if status >= 500 else logging.WARNING if status >= 400 else logging.INFO
    latency = round((time.perf_counter() - t0) * 1000, 2)
    log(
        logger,
        "request",
        level=level,
        message=f"{request.method} {request.url.path} → {status} за {latency} мс",
        request_id=request_id,
        method=request.method,
        path=request.url.path,
        status=status,
        latency_ms=latency,
        user_id=getattr(request.state, "user_id", None),
    )
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["x-request-id", "x-trace-id"],
)


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    # ошибка бизнес-правила: какой код, почему (текст для пользователя) и где
    if exc.status_code >= 500:
        trace.get_current_span().set_status(StatusCode.ERROR, exc.code)
    trace.get_current_span().set_attribute("app.error_code", exc.code)
    log(
        logger,
        "app_error",
        level=logging.ERROR if exc.status_code >= 500 else logging.WARNING,
        message=f"{request.method} {request.url.path} → {exc.status_code} {exc.code}: {exc.message}",
        request_id=request.state.request_id,
        method=request.method,
        path=request.url.path,
        status=exc.status_code,
        code=exc.code,
        reason=exc.message,
        user_id=getattr(request.state, "user_id", None),
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message, "code": exc.code, "request_id": request.state.request_id},
    )


@app.exception_handler(OverflowError)
async def overflow_handler(request: Request, exc: OverflowError):
    # id больше 64 бит не может существовать в базе: это «не найдено», а не ошибка сервера
    return await app_error_handler(request, NotFoundError("Не найдено"))


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    errors = [
        {"field": ".".join(str(p) for p in e["loc"][1:]), "message": e["msg"]} for e in exc.errors()
    ]
    # какие поля не прошли проверку (сами значения не пишем: там может быть пароль)
    log(
        logger,
        "validation_failed",
        level=logging.WARNING,
        message=f"{request.method} {request.url.path} → 422: некорректные поля "
        + ", ".join(f"{e['field'] or 'тело'} ({e['message']})" for e in errors)[:500],
        request_id=request.state.request_id,
        method=request.method,
        path=request.url.path,
        fields=[e["field"] for e in errors],
        reasons=[e["message"] for e in errors],
    )
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
api.include_router(qr_codes.router)
api.include_router(assistant.router)
api.include_router(ai_photo.router)
api.include_router(journey.router)
app.include_router(api)

# трейсинг подключается к готовому приложению: внешняя прослойка OpenTelemetry открывает спан до access_log,
# поэтому trace_id есть в каждой записи о запросе и ошибке
tracer_provider = setup_tracing(
    app, engine, settings.app_env, settings.sage_traces_endpoint, settings.sage_api_key
)

if settings.static_dir and not mount_site(app, settings.static_dir):
    logger.warning("STATIC_DIR задан, но index.html там не найден: сайт не подключён")
