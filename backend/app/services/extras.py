"""Чек-лист первого дня, потерянные вещи с подсказками и напоминания о неописанных коробках."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.errors import NotFoundError, ValidationFailed
from app.models import Box, FirstDayItem, Item
from app.schemas import BoxStatus, HintOut, LostItemOut, ReminderOut
from app.services.boxes import BoxService, _box_out, _item_out, normalize

MAX_HINTS = 10


class FirstDayService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_items(self, project_id: uuid.UUID) -> list[FirstDayItem]:
        return list(
            self.db.scalars(
                select(FirstDayItem)
                .where(FirstDayItem.project_id == project_id)
                .order_by(FirstDayItem.id)
            )
        )

    def get(self, project_id: uuid.UUID, item_id: int) -> FirstDayItem:
        item = self.db.get(FirstDayItem, item_id)
        if not item or item.project_id != project_id:
            raise NotFoundError("Пункт не найден")
        return item

    def create(self, project_id: uuid.UUID, title: str) -> FirstDayItem:
        item = FirstDayItem(project_id=project_id, title=title)
        self.db.add(item)
        self.db.commit()
        return item

    def update(self, project_id: uuid.UUID, item_id: int, changes: dict) -> FirstDayItem:
        item = self.get(project_id, item_id)
        for field, value in changes.items():
            if value is None:
                raise ValidationFailed(f"Поле {field} нельзя очистить")
            setattr(item, field, value)
        self.db.commit()
        return item

    def delete(self, project_id: uuid.UUID, item_id: int) -> None:
        self.db.delete(self.get(project_id, item_id))
        self.db.commit()


def _words(text: str) -> set[str]:
    """Основы слов для грубого сравнения: первые 5 букв слов от 3 букв (чайник ~ чайника)."""
    cleaned = "".join(c if c.isalnum() else " " for c in normalize(text))
    return {w[:5] for w in cleaned.split() if len(w) >= 3}


class LostService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.boxes = BoxService(db)

    def lost_items(self, project_id: uuid.UUID) -> list[LostItemOut]:
        rows = self.db.execute(
            select(Item, Box)
            .join(Box, Box.id == Item.box_id)
            .where(Box.project_id == project_id, Item.lost.is_(True))
            .order_by(Item.id)
        ).all()
        return [
            LostItemOut(
                item=_item_out(i, b.number), box_number=b.number, room=b.room, status=b.status
            )  # type: ignore[arg-type]
            for i, b in rows
        ]

    def hints(self, project_id: uuid.UUID, item_id: int) -> list[HintOut]:
        """В каких НЕраспакованных коробках искать вещь: где записана, где лежит похожее, в той же комнате."""
        item, own = self.boxes.get_item(project_id, item_id)
        mine = _words(item.name)
        # вещи всех коробок подгружаются одним запросом, а не отдельным запросом на каждую коробку
        candidates = self.db.scalars(
            select(Box)
            .where(Box.project_id == project_id, Box.status != BoxStatus.UNPACKED.value)
            .options(selectinload(Box.items))
        ).all()
        hints = []
        for box in candidates:
            if box.id == own.id:
                reason, score = "recorded", 1.0
            elif mine and any(
                mine & _words(other.name) for other in box.items if other.id != item.id
            ):
                reason, score = "similar_content", 0.8
            elif box.room == own.room:
                reason, score = "same_room", 0.6
            else:
                continue
            hints.append(
                HintOut(
                    box_number=box.number,
                    room=box.room,
                    status=box.status,
                    reason=reason,
                    score=score,
                )
            )  # type: ignore[arg-type]
        hints.sort(key=lambda h: (-h.score, h.box_number))  # порядок всегда одинаковый
        return hints[:MAX_HINTS]


def reminders(db: Session, project_id: uuid.UUID) -> list[ReminderOut]:
    """Коробки «заполнить позже»: вещей нет, срок не задан или уже наступил."""
    now = datetime.now(UTC)
    result = []
    empty_boxes = db.scalars(
        select(Box)
        .where(
            Box.project_id == project_id,
            Box.fill_later.is_(True),
            ~select(Item.id).where(Item.box_id == Box.id).exists(),  # вещей нет: один запрос на всё
        )
        .order_by(Box.number)
    ).all()
    for box in empty_boxes:
        remind_at = (
            box.remind_at.replace(tzinfo=UTC)
            if box.remind_at and box.remind_at.tzinfo is None
            else box.remind_at
        )
        if remind_at is None or remind_at <= now:
            result.append(ReminderOut(box=_box_out(box, 0), overdue=remind_at is not None))
    return result
