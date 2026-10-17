"""Логи: формат для Sage, аудит ключевых действий и ошибок, аппендер в Sage Logs Collector."""

import json
import logging
import threading

import pytest

from app.logging_setup import JsonFormatter, audit
from app.sage_appender import SageHandler


class Capture(logging.Handler):
    """Собирает записи логгера app уже в JSON, как их увидит Sage."""

    def __init__(self) -> None:
        super().__init__()
        self.setFormatter(JsonFormatter("test"))
        self.lines: list[dict] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.lines.append(json.loads(self.format(record)))

    def actions(self) -> list[str]:
        return [x["action"] for x in self.lines if x["msg"] == "audit"]


@pytest.fixture()
def logs():
    capture = Capture()
    logger = logging.getLogger("app")
    logger.addHandler(capture)
    yield capture
    logger.removeHandler(capture)


# ---------- формат ----------
def test_record_has_sage_required_fields_and_warn_level(logs):
    audit("demo.check", level=logging.WARNING, project_id="p1", name="Чайник", title="Секрет")
    line = logs.lines[-1]
    for field in ("@timestamp", "env", "system", "inst", "level"):
        assert line[field]
    assert line["env"] == "test" and line["system"] == "movermate"
    assert line["level"] == "WARN"  # в Sage уровень называется WARN, а не WARNING
    assert line["@timestamp"].endswith("+00:00")  # ISO, UTC
    assert "name" not in line and "title" not in line  # содержимое пользователя в лог не пишем


# ---------- ключевые действия и ошибки ----------
def test_main_actions_are_logged_without_secrets(client, logs):
    client.post("/api/auth/logout")
    client.post("/api/auth/register", json={"username": "logcheck", "password": "очень-секретно"})
    pid = client.post("/api/projects", json={"name": "Лог", "move_date": "2026-11-01"}).json()["id"]
    base = f"/api/projects/{pid}"
    n = client.post(f"{base}/boxes", json={"room": "Кухня", "items_text": "Чайник"}).json()[
        "number"
    ]
    client.post(f"{base}/boxes/{n}/transitions", json={"to": "packed"})
    client.post(f"{base}/invites")
    client.post("/api/auth/logout")
    client.post("/api/auth/login", json={"username": "logcheck", "password": "не-тот-пароль"})

    actions = logs.actions()
    for action in [
        "auth.registered",
        "project.created",
        "box.created",
        "box.status_changed",
        "invite.created",
        "auth.logout",
        "auth.login_failed",
    ]:
        assert action in actions, action
    status = next(x for x in logs.lines if x.get("action") == "box.status_changed")
    assert (status["from"], status["to"]) == ("packing", "packed") and status["project_id"] == pid
    everything = json.dumps(logs.lines, ensure_ascii=False)
    assert "очень-секретно" not in everything and "не-тот-пароль" not in everything
    assert "mm_session" not in everything


def test_errors_are_logged_with_reason_and_request_id(client, base, logs):
    n = client.post(f"{base}/boxes", json={"room": "Кухня", "items_text": "Чайник"}).json()[
        "number"
    ]
    r = client.post(f"{base}/boxes/{n}/transitions", json={"to": "packing"})  # тот же статус - 409
    err = next(x for x in logs.lines if x["msg"] == "app_error")
    assert err["status"] == 409 and err["code"] == "conflict" and "уже" in err["reason"]
    assert err["request_id"] == r.json()["request_id"] and err["level"] == "WARN"
    request_line = [x for x in logs.lines if x["msg"] == "request"][-1]
    assert (
        request_line["status"] == 409
        and request_line["level"] == "WARN"
        and request_line["user_id"]
    )

    client.post(f"{base}/boxes", json={"room": ""})
    bad = next(x for x in logs.lines if x["msg"] == "validation_failed")
    assert bad["fields"] == ["room"] and bad["level"] == "WARN"


# ---------- аппендер ----------
class FakeSage:
    def __init__(self, answers: list[tuple[int, float | None]] | None = None) -> None:
        self.answers = list(answers or [])
        self.bodies: list[str] = []
        self.done = threading.Event()

    def __call__(self, url: str, key: str, body: bytes) -> tuple[int, float | None]:
        assert url.endswith("/multiline/") and key == "spirit-key"
        self.bodies.append(body.decode())
        answer = self.answers.pop(0) if self.answers else (200, None)
        if answer[0] == 200:
            self.done.set()
        return answer


def make_handler(fake: FakeSage, **kw) -> SageHandler:
    h = SageHandler("https://sage/api/hack-led-20/multiline/", "spirit-key", send=fake, **kw)
    h.setFormatter(JsonFormatter("test"))
    return h


def record(msg: str) -> logging.LogRecord:
    return logging.LogRecord("app", logging.INFO, __file__, 1, msg, None, None)


def test_appender_sends_newline_delimited_json_batches():
    fake = FakeSage()
    h = make_handler(fake, batch_size=2, flush_seconds=0.05)
    for i in range(3):
        h.emit(record(f"m{i}"))
    h.close()
    lines = [json.loads(line) for body in fake.bodies for line in body.splitlines()]
    assert [x["msg"] for x in lines] == ["m0", "m1", "m2"]  # ничего не потерялось, порядок сохранён
    assert all(len(b.splitlines()) <= 2 for b in fake.bodies)  # пачки не больше batch_size


def test_appender_retries_on_429_and_gives_up_on_401():
    fake = FakeSage([(429, 0.01), (200, None)])
    h = make_handler(fake, flush_seconds=0.05)
    h.emit(record("квота"))
    assert fake.done.wait(5)
    h.close()
    assert len(fake.bodies) == 2 and h.failed == 0  # повторили ту же пачку

    wrong_key = FakeSage([(401, None)])
    h = make_handler(wrong_key, flush_seconds=0.05)
    h.emit(record("нет доступа"))
    h.close()
    assert len(wrong_key.bodies) == 1 and h.failed == 1  # неверный ключ: повтор не поможет


def test_appender_never_blocks_the_app_when_queue_is_full():
    gate = threading.Event()

    def stuck(url: str, key: str, body: bytes) -> tuple[int, float | None]:
        gate.wait(5)  # Sage «завис»
        return 200, None

    h = SageHandler(
        "https://sage/api/g/multiline/",
        "k",
        send=stuck,
        max_queue=2,
        batch_size=1,
        flush_seconds=0.01,
    )
    h.setFormatter(JsonFormatter("test"))
    for i in range(20):
        h.emit(record(f"m{i}"))  # не ждёт отправки
    assert h.dropped > 0
    gate.set()
    h.close()


def test_http_send_posts_ndjson_with_jwt_and_reads_retry_hint():
    from http.server import BaseHTTPRequestHandler, HTTPServer

    from app.sage_appender import http_send

    seen: list[tuple[str, str, bytes]] = []

    class Collector(BaseHTTPRequestHandler):
        def do_POST(self):  # noqa: N802 - имя метода задаёт http.server
            body = self.rfile.read(int(self.headers["Content-Length"]))
            seen.append((self.path, self.headers["Authorization"], body))
            if len(seen) == 1:
                self.send_response(429)
                self.send_header("wait-ms", "1500")
            else:
                self.send_response(200)
            self.end_headers()

        def log_message(self, *args):  # тишина в выводе тестов
            pass

    server = HTTPServer(("127.0.0.1", 0), Collector)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}/api/hack-led-20/multiline/"
    try:
        assert http_send(url, "spirit-key", b'{"a":1}\n') == (429, 1.5)
        assert http_send(url, "spirit-key", b'{"a":1}\n') == (200, None)
    finally:
        server.shutdown()
    assert seen[0][0] == "/api/hack-led-20/multiline/" and seen[0][1] == "JWT spirit-key"
    assert seen[0][2] == b'{"a":1}\n'


def test_setup_logging_adds_sage_appender_only_with_url_and_key():
    from app.logging_setup import close_logging, setup_logging

    logger = logging.getLogger("app")
    saved = list(logger.handlers)
    for h in saved:
        logger.removeHandler(h)
    try:
        setup_logging("INFO", "test", "https://sage/api/g/multiline/", "key")
        assert any(isinstance(h, SageHandler) for h in logger.handlers)
        close_logging()
        assert not any(isinstance(h, SageHandler) for h in logger.handlers)
        for h in list(logger.handlers):
            logger.removeHandler(h)
        setup_logging("INFO", "test", "", "key")  # без адреса - только stdout
        assert not any(isinstance(h, SageHandler) for h in logger.handlers)
    finally:
        for h in list(logger.handlers):
            logger.removeHandler(h)
        for h in saved:
            logger.addHandler(h)


def test_invite_token_never_reaches_the_request_log(client, base, logs):
    token = client.post(f"{base}/invites").json()["token"]
    client.get(f"/api/invites/{token}")
    everything = json.dumps(logs.lines, ensure_ascii=False)
    assert token not in everything and "/api/invites/***" in everything


def test_error_logs_mask_invite_tokens_and_checks_are_tagged(client, logs):
    client.post("/api/invites/secret-token-123/accept", headers={"X-MoverMate-Check": "e2e"})
    everything = json.dumps(logs.lines, ensure_ascii=False)
    assert "secret-token-123" not in everything  # и в app_error, не только в request
    request = next(
        x for x in logs.lines if x.get("msg") == "request" and "invites" in x.get("path", "")
    )
    assert request["check"] == "e2e"
