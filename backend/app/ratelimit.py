"""Ограничение числа неудачных попыток входа. В памяти процесса: для одного инстанса достаточно,
для нескольких реплик нужен общий счётчик (Redis)."""

import threading
import time
from collections import defaultdict, deque

from app.config import get_settings
from app.errors import TooManyRequestsError


class FailureLimiter:
    def __init__(self) -> None:
        self._failures: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, key: str, now: float, window: int) -> deque[float]:
        q = self._failures[key]
        while q and now - q[0] > window:
            q.popleft()
        return q

    def check(self, key: str) -> None:
        s = get_settings()
        with self._lock:
            q = self._prune(key, time.monotonic(), s.login_window_seconds)
            if len(q) >= s.login_attempts:
                raise TooManyRequestsError(
                    "Слишком много неудачных попыток входа. Подождите минуту."
                )

    def fail(self, key: str) -> None:
        with self._lock:
            self._failures[key].append(time.monotonic())

    def clear(self, key: str | None = None) -> None:
        with self._lock:
            if key is None:
                self._failures.clear()
            else:
                self._failures.pop(key, None)


login_limiter = FailureLimiter()
