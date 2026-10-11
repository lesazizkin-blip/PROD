"""Статистика для дашборда и для метрики продукта («North Star» в критериях Product-жюри)."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Item, User
from app.schemas import Status


class StatsService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def summary(self, user: User) -> dict:
        stmt = select(
            Item.status, func.count(Item.id), func.coalesce(func.sum(Item.amount), 0)
        ).group_by(Item.status)
        if user.role != "admin":
            stmt = stmt.where(Item.owner_id == user.id)
        rows = self.db.execute(stmt).all()

        by_status = {s.value: 0 for s in Status}
        amount_by_status = {s.value: 0 for s in Status}
        for status, count, amount in rows:
            by_status[status] = count
            amount_by_status[status] = int(amount)

        decided = by_status["approved"] + by_status["rejected"]
        return {
            "total": sum(by_status.values()),
            "by_status": by_status,
            "amount_by_status": amount_by_status,
            # Доля согласованных среди решённых: пример «главной метрики» процесса согласования
            "approval_rate": round(by_status["approved"] / decided, 2) if decided else None,
            "pending": by_status["in_review"],
        }
