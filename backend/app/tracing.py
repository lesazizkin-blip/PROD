"""Трейсинг OpenTelemetry для Sage: каждый запрос API - трейс, внутри спаны запросов к БД и вызова AI-модели.

Идентификаторы trace_id/span_id есть всегда и пишутся в каждую строку лога (logging_setup) - по ним в Sage
из лога открывается трейс. Отправка спанов в Sage включается адресом коллектора SAGE_TRACES_ENDPOINT
(OTLP gRPC, например https://<хост коллектора>:4319) и тем же Spirit API ключом, что и логи (SAGE_API_KEY).
Без адреса спаны живут только в процессе: сеть не используется."""

import socket

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.sampling import ALWAYS_ON

from app.logging_setup import SYSTEM

SAGE_GROUP = "hack-led-20"
# deployment.environment в Sage: prod, preprod, dev, test, stage
_ENVS = {
    "production": "prod",
    "prod": "prod",
    "test": "test",
    "stage": "stage",
    "preprod": "preprod",
}

tracer = trace.get_tracer("movermate")


def resource_attributes(env: str) -> dict[str, str]:
    """Обязательные ресурсные атрибуты Sage (документация Sage → Трейсы → Настройка трейсинга)."""
    return {
        "service.namespace": SAGE_GROUP,
        "service.name": SYSTEM,
        "service.instance.id": socket.gethostname(),
        "deployment.environment": _ENVS.get(env, "dev"),
        "sage.group": SAGE_GROUP,
    }


def setup_tracing(app, engine, env: str, endpoint: str = "", key: str = "") -> TracerProvider:
    provider = TracerProvider(resource=Resource.create(resource_attributes(env)), sampler=ALWAYS_ON)
    if endpoint.strip() and key.strip():
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
            Compression,
            OTLPSpanExporter,
        )
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        exporter = OTLPSpanExporter(
            endpoint=endpoint.strip(),
            headers=(("authorization", f"JWT {key.strip()}"),),
            compression=Compression.Gzip,
        )
        provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)

    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

    # имя спана - шаблон маршрута (/api/projects/{pid}/boxes/{number}), а не путь с id:
    # у Sage лимит 300 уникальных операций на сервис. Проверку здоровья (каждые 15 с) не трейсим.
    FastAPIInstrumentor.instrument_app(app, tracer_provider=provider, excluded_urls="api/health")
    trace_queries(engine)
    return provider


def trace_queries(engine) -> None:
    """Спан на каждый SQL-запрос внутри запроса API (готовый инструментатор не поддерживает SQLAlchemy 2.1).
    Имя спана - вид запроса (SELECT, INSERT...), текст - с плейсхолдерами, значения параметров не пишутся."""
    from sqlalchemy import event

    db_tracer = trace.get_tracer("movermate.db")

    @event.listens_for(engine, "before_cursor_execute")
    def _start(conn, cursor, statement, parameters, context, executemany):
        if not trace.get_current_span().get_span_context().is_valid:
            return  # запрос вне API (миграции, сид) - отдельный трейс не нужен
        op = statement.lstrip().split(" ", 1)[0].upper()[:16] or "SQL"
        span = db_tracer.start_span(
            f"db {op}",
            kind=trace.SpanKind.CLIENT,
            attributes={
                "db.system": engine.dialect.name,
                "db.operation.name": op,
                "db.query.text": statement[:1000],
            },
        )
        conn.info.setdefault("otel_spans", []).append(span)

    @event.listens_for(engine, "after_cursor_execute")
    def _end(conn, cursor, statement, parameters, context, executemany):
        spans = conn.info.get("otel_spans")
        if spans:
            spans.pop().end()

    @event.listens_for(engine, "handle_error")
    def _error(ctx):
        spans = ctx.connection.info.get("otel_spans") if ctx.connection is not None else None
        if spans:
            span = spans.pop()
            span.record_exception(ctx.original_exception)
            span.set_status(trace.StatusCode.ERROR, type(ctx.original_exception).__name__)
            span.end()


def current_ids() -> tuple[str, str] | None:
    """trace_id (32 hex) и span_id (16 hex) текущего спана - в формате, который Sage связывает с трейсом."""
    ctx = trace.get_current_span().get_span_context()
    if not ctx.is_valid:
        return None
    return format(ctx.trace_id, "032x"), format(ctx.span_id, "016x")
