"""Аппендер логов в Sage (Logs Collector): `POST <SAGE_LOGS_URL>` с заголовком `Authorization: JWT <ключ>`,
в теле - JSON-записи через перевод строки (по одной записи на строку).

Запрос к Sage не должен тормозить ответы пользователю, поэтому:
- `emit` только кладёт готовую строку в очередь (если очередь полна, запись отбрасывается и считается);
- отдельный фоновый поток отправляет записи пачками: по `batch_size` штук или раз в `flush_seconds`;
- на 429 и ошибки сети пачка повторяется позже (Sage присылает `wait-ms` / `Retry-After`), не дольше `max_retries` раз;
- при остановке приложения `close()` досылает то, что осталось в очереди.
"""

import logging
import queue
import sys
import threading
import time
import urllib.error
import urllib.request
from collections.abc import Callable

# send(url, key, body) -> (код ответа, через сколько секунд повторить или None)
Sender = Callable[[str, str, bytes], tuple[int, float | None]]


def http_send(url: str, key: str, body: bytes) -> tuple[int, float | None]:
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={"Authorization": f"JWT {key}", "Content-Type": "application/x-ndjson"},
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status, None
    except urllib.error.HTTPError as e:
        wait = e.headers.get("wait-ms")
        retry_after = float(wait) / 1000 if wait else _float(e.headers.get("Retry-After"))
        return e.code, retry_after


def _float(value: str | None) -> float | None:
    try:
        return float(value) if value else None
    except ValueError:
        return None


class SageHandler(logging.Handler):
    def __init__(
        self,
        url: str,
        key: str,
        *,
        batch_size: int = 100,
        flush_seconds: float = 1.0,
        max_queue: int = 10_000,
        max_retries: int = 3,
        send: Sender = http_send,
    ) -> None:
        super().__init__()
        self.url, self.key = url, key
        self.batch_size, self.flush_seconds, self.max_retries = (
            batch_size,
            flush_seconds,
            max_retries,
        )
        self.send = send
        self.queue: queue.Queue[str] = queue.Queue(max_queue)
        self.dropped = 0  # сколько записей не влезло в очередь
        self.failed = 0  # сколько записей не удалось доставить
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="sage-appender", daemon=True)
        self._thread.start()

    def emit(self, record: logging.LogRecord) -> None:
        try:
            self.queue.put_nowait(self.format(record))
        except queue.Full:
            self.dropped += 1
        except Exception:
            self.handleError(record)

    def _take_batch(self, timeout: float) -> list[str]:
        batch: list[str] = []
        deadline = time.monotonic() + timeout
        while len(batch) < self.batch_size:
            left = deadline - time.monotonic()
            try:
                batch.append(
                    self.queue.get(timeout=max(left, 0)) if left > 0 else self.queue.get_nowait()
                )
            except queue.Empty:
                break
        return batch

    def _deliver(self, batch: list[str]) -> None:
        body = ("\n".join(batch) + "\n").encode("utf-8")
        for attempt in range(self.max_retries + 1):
            try:
                status, retry_after = self.send(self.url, self.key, body)
            except Exception as exc:  # нет сети, DNS, таймаут
                status, retry_after = 0, None
                error = repr(exc)
            else:
                error = f"HTTP {status}"
            if 200 <= status < 300:
                return
            if status and status not in (429,) and status < 500:
                break  # 400/401/403/404 - повтор не поможет (неверный ключ или группа)
            if attempt < self.max_retries and not self._stop.is_set():
                time.sleep(min(retry_after or 2**attempt, 30))
        self.failed += len(batch)
        # в stderr, а не в логгер: иначе ошибка отправки сама пошла бы в Sage по кругу
        print(f"sage-appender: не доставлено {len(batch)} записей ({error})", file=sys.stderr)

    def _run(self) -> None:
        while not self._stop.is_set():
            batch = self._take_batch(self.flush_seconds)
            if batch:
                self._deliver(batch)
        while batch := self._take_batch(0):  # досылаем остаток при остановке
            self._deliver(batch)

    def close(self) -> None:
        self._stop.set()
        self._thread.join(timeout=15)
        super().close()
