"""Атомарная резервация попытки ДО платного вызова; ошибки не возвращают квоту."""

from datetime import UTC, datetime, timedelta, timezone

from sqlalchemy import update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import Settings
from app.errors import TooManyRequestsError
from app.models import AiUsageBudget
from app.services.planner import PlannerUnavailable


def reserve_attempt(db: Session, user_id: int, settings: Settings, *, now: datetime | None = None):
    """Счётчики живут в основной БД, поэтому общий предел действует во всех workers.

    UTC-окна: календарные сутки и час. Порядок блокировки всегда global -> user.
    UPDATE ... WHERE used < limit не позволяет конкурентным запросам превысить предел.
    Если персональная квота исчерпана, общий счётчик откатывается в той же транзакции.
    """
    current = (now or datetime.now(UTC)).astimezone(UTC)
    moscow = timezone(timedelta(hours=3))
    next_hour = current.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    next_day = current.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)

    def resets_at(value: datetime) -> str:
        return value.astimezone(moscow).strftime("%d.%m.%Y в %H:%M по Москве")

    shared = "Лимит общий для советов по коробкам, фото-помощника и ИИ-плана."
    daily_message = (
        f"Общий дневной лимит ИИ-запросов для всего приложения исчерпан "
        f"({settings.ai_global_requests_per_day} за сутки). "
        f"Обновится {resets_at(next_day)}. {shared}"
        if settings.ai_global_requests_per_day
        else "Генерация ИИ отключена в настройках приложения. Обратитесь к администратору."
    )
    windows = [
        (
            f"global:{current:%Y-%m-%d}",
            settings.ai_global_requests_per_day,
            daily_message,
        ),
        (
            f"user:{user_id}:{current:%Y-%m-%dT%H}",
            settings.ai_requests_per_hour,
            f"Ваш часовой лимит ИИ-запросов исчерпан ({settings.ai_requests_per_hour} за час). "
            f"Обновится {resets_at(next_hour)}. {shared}",
        ),
    ]
    dialect = db.get_bind().dialect.name
    insert = {"sqlite": sqlite_insert, "postgresql": pg_insert}.get(dialect)
    if insert is None:
        raise PlannerUnavailable("Не удалось проверить лимиты AI. Используйте стандартный план.")
    try:
        for bucket, limit, message in windows:
            db.execute(
                insert(AiUsageBudget)
                .values(bucket=bucket, used=0)
                .on_conflict_do_nothing(
                    index_elements=[AiUsageBudget.bucket],
                )
            )
            reserved = db.execute(
                update(AiUsageBudget)
                .where(AiUsageBudget.bucket == bucket, AiUsageBudget.used < limit)
                .values(used=AiUsageBudget.used + 1)
                .returning(AiUsageBudget.used)
            ).scalar_one_or_none()
            if reserved is None:
                raise TooManyRequestsError(message)
        # Закрываем транзакцию до сети. Перезапуск после этого тоже расходует попытку.
        db.commit()
    except TooManyRequestsError:
        db.rollback()
        raise
    except SQLAlchemyError:
        db.rollback()
        # Недоступная БД не даёт бесплатного обхода: провайдер не будет вызван.
        raise PlannerUnavailable(
            "Не удалось проверить лимиты AI. Используйте стандартный план."
        ) from None
