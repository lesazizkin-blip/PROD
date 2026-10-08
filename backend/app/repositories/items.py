from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.models import Item, ItemEvent


class ItemRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def add(self, item: Item) -> Item:
        self.db.add(item)
        self.db.flush()
        return item

    def get(self, item_id: int) -> Item | None:
        # joinedload: владелец подгружается тем же запросом (без N+1 при сериализации)
        return self.db.scalar(
            select(Item).options(joinedload(Item.owner)).where(Item.id == item_id)
        )

    def _filters(self, owner_id: int | None, status: str | None, q: str | None) -> list:
        conds = []
        if owner_id is not None:
            conds.append(Item.owner_id == owner_id)
        if status:
            conds.append(Item.status == status)
        if q:
            like = f"%{q.lower()}%"
            conds.append(
                or_(func.lower(Item.title).like(like), func.lower(Item.description).like(like))
            )
        return conds

    def search(
        self, *, owner_id: int | None, status: str | None, q: str | None, limit: int, offset: int
    ) -> list[Item]:
        stmt = (
            select(Item)
            .options(joinedload(Item.owner))
            .where(*self._filters(owner_id, status, q))
            .order_by(Item.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(self.db.scalars(stmt))

    def count(self, *, owner_id: int | None, status: str | None, q: str | None) -> int:
        stmt = select(func.count(Item.id)).where(*self._filters(owner_id, status, q))
        return self.db.scalar(stmt) or 0

    def add_event(self, event: ItemEvent) -> ItemEvent:
        self.db.add(event)
        self.db.flush()
        return event

    def list_events(self, item_id: int) -> list[ItemEvent]:
        stmt = (
            select(ItemEvent)
            .options(joinedload(ItemEvent.actor))
            .where(ItemEvent.item_id == item_id)
            .order_by(ItemEvent.id)
        )
        return list(self.db.scalars(stmt))
