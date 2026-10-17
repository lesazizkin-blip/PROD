"""JSON-логи в stdout: их собирает Docker (`docker compose logs`) и может забрать Sage.

Формат подходит для Sage Logs Collector: в каждой записи обязательные поля `@timestamp` (ISO, UTC),
`env`, `system`, `inst`, уровень `level` (INFO, WARN, ERROR). Пароли, токены и содержимое вещей
в логи не пишутся: только идентификаторы, коды и пути.
"""

import json
import logging
import socket
import sys
from datetime import UTC, datetime

SYSTEM = "movermate"
# уровни Python -> уровни Sage (WARNING там называется WARN)
_LEVELS = {
    "WARNING": "WARN",
    "CRITICAL": "CRITICAL",
    "ERROR": "ERROR",
    "INFO": "INFO",
    "DEBUG": "DEBUG",
}


class JsonFormatter(logging.Formatter):
    def __init__(self, env: str = "dev") -> None:
        super().__init__()
        self.env = env
        self.inst = socket.gethostname()

    def format(self, record: logging.LogRecord) -> str:
        data = {
            "@timestamp": datetime.fromtimestamp(record.created, UTC).isoformat(
                timespec="milliseconds"
            ),
            "env": self.env,
            "system": SYSTEM,
            "inst": self.inst,
            "level": _LEVELS.get(record.levelname, record.levelname),
            "logger": record.name,
            "msg": record.getMessage(),
        }
        data.update(getattr(record, "extra_fields", {}))
        if record.exc_info:
            data["exc"] = self.formatException(record.exc_info)
        return json.dumps(data, ensure_ascii=False, default=str)


def setup_logging(
    level: str = "INFO", env: str = "dev", sage_url: str = "", sage_key: str = ""
) -> logging.Logger:
    """Логгер приложения: stdout всегда, плюс аппендер в Sage, если заданы адрес и ключ."""
    logger = logging.getLogger("app")
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JsonFormatter(env))
        logger.addHandler(handler)
        if sage_url.strip() and sage_key.strip():
            from app.sage_appender import SageHandler

            sage = SageHandler(sage_url.strip(), sage_key.strip())
            sage.setFormatter(JsonFormatter(env))
            logger.addHandler(sage)
        logger.propagate = False
    logger.setLevel(level)
    return logger


def close_logging() -> None:
    """При остановке: аппендеры досылают очередь и закрываются."""
    logger = logging.getLogger("app")
    for handler in list(logger.handlers):
        if not isinstance(handler, logging.StreamHandler):
            logger.removeHandler(handler)
            handler.close()


def log(logger: logging.Logger, msg: str, level: int = logging.INFO, **fields) -> None:
    # пустые поля не пишем: запись короче, а в Sage нет столбцов из одних null
    clean = {k: v for k, v in fields.items() if v is not None}
    logger.log(level, msg, extra={"extra_fields": clean})


# Ключи, которые в аудит не попадают: это содержимое, которое ввёл пользователь (названия вещей и задач)
_CONTENT_KEYS = {"name", "title"}


def audit(action: str, level: int = logging.INFO, **fields) -> None:
    """Запись о действии пользователя (вход, создание коробки, смена статуса...).
    Поле `action` по одному названию находит все такие действия: `action="box.status_changed"`."""
    clean = {k: v for k, v in fields.items() if k not in _CONTENT_KEYS}
    log(logging.getLogger("app"), "audit", level=level, action=action, **clean)
