"""Трейсинг и связь логов с трейсами: спаны по шаблону маршрута, SQL-спаны, trace_id в логах и ответе."""

import json
import logging

import pytest
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from app import main
from app.tracing import resource_attributes


@pytest.fixture()
def spans():
    exporter = InMemorySpanExporter()
    main.tracer_provider.add_span_processor(SimpleSpanProcessor(exporter))
    yield exporter
    exporter.clear()


@pytest.fixture()
def lines():
    """JSON-строки, которые логгер приложения пишет в stdout (тот же формат уходит в Sage)."""
    records: list[dict] = []
    handler = logging.Handler()
    handler.emit = lambda r: records.append(json.loads(main.logger.handlers[0].formatter.format(r)))
    main.logger.addHandler(handler)
    yield records
    main.logger.removeHandler(handler)


def test_request_is_a_trace_named_by_route_with_sql_spans(client, base, spans):
    from tests.conftest import make_box

    make_box(client, base, room="Тайная комната")
    r = client.get(f"{base}/boxes", params={"room": "Тайная комната"})
    assert r.status_code == 200
    trace_id = r.headers["x-trace-id"]
    assert len(trace_id) == 32
    mine = [s for s in spans.get_finished_spans() if format(s.context.trace_id, "032x") == trace_id]
    names = {s.name for s in mine}
    # имя - шаблон маршрута, не путь с uuid: у Sage лимит 300 операций на сервис
    assert "GET /api/projects/{pid}/boxes" in names
    db = [s for s in mine if s.name.startswith("db ")]
    assert db and all(s.attributes["db.system"] == "sqlite" for s in db)
    # значения параметров запроса в спан не попадают, только текст с плейсхолдерами
    assert not any("Тайная" in s.attributes["db.query.text"] for s in db)


def test_logs_carry_trace_id_and_human_message(client, base, lines):
    r = client.get(f"{base}/boxes/999")
    assert r.status_code == 404
    trace_id = r.headers["x-trace-id"]
    error = next(x for x in lines if x["msg"] == "app_error")
    assert error["trace_id"] == trace_id and len(error["span_id"]) == 16
    assert error["message"] == f"GET {base}/boxes/999 → 404 not_found: Коробка не найдена"
    request = next(x for x in lines if x["msg"] == "request")
    assert request["trace_id"] == trace_id
    assert request["message"].startswith(f"GET {base}/boxes/999 → 404 за ")


def test_validation_message_names_fields_without_values(client, base, lines):
    r = client.post(f"{base}/boxes", json={"room": "", "items_text": "секретная вещь"})
    assert r.status_code == 422
    entry = next(x for x in lines if x["msg"] == "validation_failed")
    assert "некорректные поля room" in entry["message"]
    assert "секретная" not in json.dumps(entry, ensure_ascii=False)


def test_unhandled_error_marks_span_and_logs_type(client, base, spans, lines, monkeypatch):
    from app.services.boxes import BoxService

    def boom(*args, **kwargs):
        raise RuntimeError("диск переполнен")

    monkeypatch.setattr(BoxService, "list_boxes", boom)
    r = client.get(f"{base}/boxes")
    assert r.status_code == 500
    entry = next(x for x in lines if x["msg"] == "unhandled_exception")
    assert entry["error_type"] == "RuntimeError"
    assert "необработанная ошибка RuntimeError: диск переполнен" in entry["message"]
    assert entry["trace_id"] == r.headers["x-trace-id"]
    server = [s for s in spans.get_finished_spans() if s.name == "GET /api/projects/{pid}/boxes"]
    assert any(s.status.status_code.name == "ERROR" for s in server)


def test_health_check_is_not_traced(anon_client, spans):
    anon_client.get("/api/health")
    assert not any("/api/health" in s.name for s in spans.get_finished_spans())


def test_resource_attributes_required_by_sage():
    attrs = resource_attributes("production")
    assert attrs["service.namespace"] == "hack-led-20"
    assert attrs["service.name"] == "movermate"
    assert attrs["sage.group"] == "hack-led-20"
    assert attrs["deployment.environment"] == "prod"
    assert attrs["service.instance.id"]
    assert resource_attributes("dev")["deployment.environment"] == "dev"
