"""Логи (JSON) + простые метрики latency/throughput. Критерий P3."""

import json
import logging
import statistics
import threading
import time
from collections import deque
from logging.handlers import RotatingFileHandler
from pathlib import Path

LOG_DIR = Path("logs")


def setup_logging() -> logging.Logger:
    logger = logging.getLogger("api")
    if logger.handlers:
        return logger
    logger.setLevel(logging.INFO)
    fmt = logging.Formatter("%(message)s")
    stream = logging.StreamHandler()
    stream.setFormatter(fmt)
    logger.addHandler(stream)
    try:
        LOG_DIR.mkdir(exist_ok=True)
        file = RotatingFileHandler(LOG_DIR / "api.log", maxBytes=5_000_000, backupCount=3)
        file.setFormatter(fmt)
        logger.addHandler(file)
    except OSError:  # read-only FS - достаточно stdout
        pass
    return logger


def log_event(logger: logging.Logger, **fields) -> None:
    fields = {"ts": round(time.time(), 3), **fields}
    logger.info(json.dumps(fields, ensure_ascii=False, default=str))


class Metrics:
    """In-process счётчики. Для продакшена заменить на Prometheus."""

    def __init__(self, window: int = 2000) -> None:
        self.started = time.time()
        self.requests = 0
        self.errors = 0
        self.latencies = deque(maxlen=window)
        self.lock = threading.Lock()

    def observe(self, latency_ms: float, status: int) -> None:
        with self.lock:
            self.requests += 1
            if status >= 500:
                self.errors += 1
            self.latencies.append(latency_ms)

    def snapshot(self) -> dict:
        with self.lock:
            lat = sorted(self.latencies)
            uptime = time.time() - self.started

            def pct(p: float) -> float | None:
                return round(lat[min(len(lat) - 1, int(p * len(lat)))], 2) if lat else None

            return {
                "uptime_s": round(uptime, 1),
                "requests_total": self.requests,
                "errors_total": self.errors,
                "rps_avg": round(self.requests / uptime, 3) if uptime else 0,
                "latency_ms": {
                    "mean": round(statistics.fmean(lat), 2) if lat else None,
                    "p50": pct(0.5),
                    "p95": pct(0.95),
                    "p99": pct(0.99),
                },
            }
