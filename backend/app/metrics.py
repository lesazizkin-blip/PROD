"""Метрики в Sage по протоколу Prometheus Remote Write (Frost): `POST <SAGE_METRICS_URL>` с заголовком
`Authorization: JWT <SAGE_API_KEY>` (тот же ключ, что у логов), тело - WriteRequest в protobuf, сжатый snappy.

Что отправляется раз в `interval` секунд:
- счётчики запросов (`movermate_http_requests_total` по методу и классу ответа 2xx/4xx/5xx), время ответа
  (`movermate_http_request_duration_ms` - сумма, число и корзины гистограммы);
- действия пользователей (`movermate_actions_total` по action из аудита: вход, регистрация, коробки, приглашения);
- состояние данных (`movermate_projects`, `movermate_users`, `movermate_boxes{status}`, `movermate_items`,
  `movermate_items_lost`) - то, что видно в продукте: сколько коробок погружено, доставлено, распаковано.

Обязательные лейблы Sage: group, system, env, dc. Отправка идёт в фоновом потоке и никогда не тормозит
и не роняет сайт: ошибка сети или ответ Sage пишутся в лог не чаще раза в 10 минут.
Без SAGE_METRICS_URL или ключа ничего не отправляется.
"""

import logging
import socket
import struct
import threading
import time
import urllib.error
import urllib.request
from collections.abc import Callable

log = logging.getLogger("app")

BUCKETS_MS = (50, 100, 250, 500, 1000, 2500)


class Registry:
    """Счётчики процесса: значения только растут (Prometheus counter), сбрасываются при перезапуске."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._values: dict[tuple[str, tuple[tuple[str, str], ...]], float] = {}

    def inc(self, name: str, value: float = 1.0, **labels: str) -> None:
        key = (name, tuple(sorted(labels.items())))
        with self._lock:
            self._values[key] = self._values.get(key, 0.0) + value

    def snapshot(self) -> list[tuple[str, dict[str, str], float]]:
        with self._lock:
            return [(name, dict(labels), v) for (name, labels), v in self._values.items()]


registry = Registry()


def observe_request(method: str, status: int, latency_ms: float) -> None:
    code = f"{status // 100}xx"
    registry.inc("movermate_http_requests_total", method=method, code=code)
    registry.inc("movermate_http_request_duration_ms_sum", latency_ms)
    registry.inc("movermate_http_request_duration_ms_count")
    for le in BUCKETS_MS:
        if latency_ms <= le:
            registry.inc("movermate_http_request_duration_ms_bucket", le=str(le))
    registry.inc("movermate_http_request_duration_ms_bucket", le="+Inf")


def observe_action(action: str) -> None:
    registry.inc("movermate_actions_total", action=action)


def business_gauges() -> list[tuple[str, dict[str, str], float]]:
    """Состояние данных одним проходом по базе (несколько COUNT, миллисекунды)."""
    from sqlalchemy import func, select

    from app.db import SessionLocal
    from app.models import Box, Item, Project, User

    with SessionLocal() as db:
        out: list[tuple[str, dict[str, str], float]] = [
            ("movermate_users", {}, db.scalar(select(func.count(User.id))) or 0),
            ("movermate_projects", {}, db.scalar(select(func.count(Project.id))) or 0),
            ("movermate_items", {}, db.scalar(select(func.count(Item.id))) or 0),
            (
                "movermate_items_lost",
                {},
                db.scalar(select(func.count(Item.id)).where(Item.status == "lost")) or 0,
            ),
        ]
        by_status = dict(
            db.execute(select(Box.status, func.count(Box.id)).group_by(Box.status)).all()
        )
        for status in ("packing", "packed", "loaded", "delivered", "unpacked"):
            out.append(("movermate_boxes", {"status": status}, by_status.get(status, 0)))
        return out


# --- кодирование Remote Write: protobuf WriteRequest + snappy (без зависимостей) ---


def _varint(n: int) -> bytes:
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def _field(number: int, payload: bytes) -> bytes:  # длина-префиксное поле (wire type 2)
    return _varint(number << 3 | 2) + _varint(len(payload)) + payload


def encode_write_request(series: list[tuple[dict[str, str], float]], ts_ms: int) -> bytes:
    """WriteRequest{timeseries: [TimeSeries{labels: [Label{name, value}], samples: [Sample{value, timestamp}]}]}."""
    body = bytearray()
    for labels, value in series:
        ts = bytearray()
        for name in sorted(labels):  # лейблы по возрастанию имени - требование протокола
            ts += _field(1, _field(1, name.encode()) + _field(2, labels[name].encode()))
        sample = b"\x09" + struct.pack("<d", float(value)) + b"\x10" + _varint(ts_ms)
        ts += _field(2, sample)
        body += _field(1, bytes(ts))
    return bytes(body)


def snappy_block(data: bytes) -> bytes:
    """Формат snappy block только из литералов: валиден для любого декодера, сжатие тут не важно."""
    out = bytearray(_varint(len(data)))
    for i in range(0, len(data), 65536):
        chunk = data[i : i + 65536]
        n = len(chunk) - 1
        if n < 60:
            out.append(n << 2)
        elif n < 256:
            out += bytes((60 << 2, n))
        else:
            out += bytes((61 << 2,)) + struct.pack("<H", n)
        out += chunk
    return bytes(out)


Sender = Callable[[str, str, bytes], int]


def http_send(url: str, key: str, body: bytes) -> int:
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"JWT {key}",
            "Content-Type": "application/x-protobuf",
            "Content-Encoding": "snappy",
            "X-Prometheus-Remote-Write-Version": "0.1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status
    except urllib.error.HTTPError as e:
        return e.code


class MetricsPusher:
    def __init__(
        self,
        url: str,
        key: str,
        *,
        group: str,
        env: str,
        dc: str = "spirit",
        interval: float = 30.0,
        send: Sender = http_send,
        gauges: Callable[[], list[tuple[str, dict[str, str], float]]] = business_gauges,
    ) -> None:
        self.url, self.key, self.interval, self.send, self.gauges = url, key, interval, send, gauges
        self.base = {
            "group": group,
            "system": "movermate",
            "env": env,
            "dc": dc,
            "inst": socket.gethostname(),
        }
        self._stop = threading.Event()
        self._last_warning = 0.0
        self.sent = 0
        self._thread = threading.Thread(target=self._run, name="sage-metrics", daemon=True)

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def collect(self) -> list[tuple[dict[str, str], float]]:
        rows = registry.snapshot()
        try:
            rows += self.gauges()
        except Exception as e:  # база занята или ещё не готова - пришлём счётчики без состояния
            self._warn(f"метрики данных не собраны: {type(e).__name__}")
        return [({"__name__": name, **self.base, **labels}, value) for name, labels, value in rows]

    def push_once(self) -> int:
        body = snappy_block(encode_write_request(self.collect(), int(time.time() * 1000)))
        try:
            status = self.send(self.url, self.key, body)
        except Exception as e:  # сеть: просто следующая попытка через interval
            self._warn(f"Sage не принял метрики: {type(e).__name__}")
            return 0
        if 200 <= status < 300:
            self.sent += 1
        else:
            self._warn(f"Sage ответил {status} на метрики")
        return status

    def _warn(self, message: str) -> None:
        if time.monotonic() - self._last_warning > 600 or not self._last_warning:
            self._last_warning = time.monotonic()
            log.warning(message, extra={"msg_key": "metrics_push_failed"})

    def _run(self) -> None:
        while not self._stop.wait(self.interval):
            self.push_once()


def group_from_logs_url(url: str, default: str = "hack-led-20") -> str:
    """Группа Sage из адреса Logs Collector: https://<хост>/api/<группа>/multiline/."""
    parts = [p for p in url.split("/") if p]
    return (
        parts[parts.index("api") + 1]
        if "api" in parts and parts.index("api") + 1 < len(parts)
        else default
    )
