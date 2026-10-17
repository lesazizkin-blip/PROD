"""Чек-лист первого дня, потерянные вещи с подсказками и напоминания о неописанных коробках."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app.errors import NotFoundError, ValidationFailed
from app.models import Box, FirstDayItem, Item
from app.schemas import BoxStatus, HintOut, ItemStatus, LostItemOut, ReminderOut
from app.services.boxes import BoxService, _box_out, _item_out, normalize
from app.services.events import log_event

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

    def bind(self, project_id: uuid.UUID, entry_id: int, number: int, name: str | None):
        # Lock the box and preparation entry; all inventory changes and retirement
        # of the preparation entry commit together, including reuse of an existing item.
        box = BoxService(self.db).get_box(project_id, number, lock=True)
        entry = self.db.scalar(
            select(FirstDayItem)
            .where(FirstDayItem.id == entry_id, FirstDayItem.project_id == project_id)
            .with_for_update()
        )
        if entry is None:
            raise NotFoundError("Пункт не найден или уже помещён в коробку")
        title = (name if name is not None else entry.title).strip()
        if not title or len(title) > 120:
            raise ValidationFailed("Название вещи: от 1 до 120 символов")
        # Claim the entry before touching inventory; a concurrent retry cannot
        # bind the same preparation entry twice, including on SQLite.
        claimed = self.db.scalar(
            delete(FirstDayItem)
            .where(FirstDayItem.id == entry_id, FirstDayItem.project_id == project_id)
            .returning(FirstDayItem.id)
            .execution_options(synchronize_session=False)
        )
        if claimed is None:
            raise NotFoundError("Пункт уже помещён в коробку")
        item = self.db.scalar(
            select(Item)
            .where(Item.box_id == box.id, Item.name_norm == normalize(title))
            .order_by(Item.id)
        )
        if item is None:
            item = Item(box_id=box.id, name=title, name_norm=normalize(title), first_day=True)
            self.db.add(item)
        else:
            item.first_day = True
        self.db.flush()
        log_event(self.db, project_id, "first_day.bound", "item", item.id, box_number=number)
        self.db.commit()
        return _item_out(item, number)


def _words(text: str) -> set[str]:
    """Основы слов для грубого сравнения: первые 5 букв слов от 3 букв (чайник ~ чайника)."""
    cleaned = "".join(c if c.isalnum() else " " for c in normalize(text))
    return {w[:5] for w in cleaned.split() if len(w) >= 3}


class LostService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.boxes = BoxService(db)

    def _items_with_box(self, project_id: uuid.UUID, condition, order) -> list[LostItemOut]:
        """Вещи проекта по условию, каждая с коробкой, комнатой и статусом коробки (один запрос)."""
        rows = self.db.execute(
            select(Item, Box)
            .join(Box, Box.id == Item.box_id)
            .where(Box.project_id == project_id, condition)
            .order_by(*order)
        ).all()
        return [
            LostItemOut(
                item=_item_out(i, b.number), box_number=b.number, room=b.room, status=b.status
            )  # type: ignore[arg-type]
            for i, b in rows
        ]

    def lost_items(self, project_id: uuid.UUID) -> list[LostItemOut]:
        return self._items_with_box(project_id, Item.status == ItemStatus.LOST.value, [Item.id])

    def first_day_items(self, project_id: uuid.UUID) -> list[LostItemOut]:
        return self._items_with_box(project_id, Item.first_day.is_(True), [Box.number, Item.id])

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
