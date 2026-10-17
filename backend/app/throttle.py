"""Защита от флуда: не больше N запросов с одного IP за окно. Память одного процесса (у нас один процесс).

Лимиты щедрые: жюри и команда на площадке могут выходить в сеть с одного IP. Цель - не дать одному
адресу положить сайт потоком запросов или зарегистрировать сотни фейковых аккаунтов.
"""

import time

from starlette.requests import Request


def client_ip(request: Request) -> str:
    # за Caddy адрес клиента приходит в X-Forwarded-For; Caddy не доверяет такому заголовку от клиента
    # и сам подставляет настоящий адрес, поэтому первый элемент подделать нельзя
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() or (request.client.host if request.client else "-")


class WindowLimiter:
    """Фиксированное окно: счётчик на (IP, номер окна). Старые окна выбрасываются при смене окна."""

    def __init__(self, limit: int, window_seconds: int) -> None:
        self.limit = limit
        self.window = window_seconds
        self._counts: dict[str, int] = {}
        self._current = -1

    def hit(self, ip: str, now: float | None = None) -> bool:
        """Учесть запрос; False - лимит окна исчерпан."""
        slot = int((time.time() if now is None else now) // self.window)
        if slot != self._current:  # новое окно: прошлые счётчики больше не нужны
            self._counts.clear()
            self._current = slot
        count = self._counts.get(ip, 0) + 1
        self._counts[ip] = count
        return count <= self.limit

    def retry_after(self, now: float | None = None) -> int:
        t = time.time() if now is None else now
        return max(1, int(self.window - t % self.window))
