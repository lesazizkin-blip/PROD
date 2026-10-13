"""Бизнес-логика согласования. Правила переходов описаны данными (RULES), а не if-ами:
новый статус/действие = новая строка в RULES + тест.

    draft ──submit──► in_review ──approve──► approved
      ▲                  │ ├──reject(+комментарий)──► rejected
      │                  │ └──request_changes(+комментарий)──┐
      └──────submit──────┴───── changes_requested ◄─────────┘
"""

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.errors import ConflictError, ForbiddenError, NotFoundError, ValidationFailed
from app.models import Item, ItemEvent, User
from app.repositories.items import ItemRepository
from app.schemas import Action, ItemCreate, ItemUpdate, Status


@dataclass(frozen=True)
class Rule:
    from_statuses: frozenset[Status]
    to_status: Status
    actor: str  # "owner" | "admin"
    comment_required: bool = False


RULES: dict[Action, Rule] = {
    Action.SUBMIT: Rule(
        frozenset({Status.DRAFT, Status.CHANGES_REQUESTED}), Status.IN_REVIEW, "owner"
    ),
    Action.APPROVE: Rule(frozenset({Status.IN_REVIEW}), Status.APPROVED, "admin"),
    Action.REJECT: Rule(
        frozenset({Status.IN_REVIEW}), Status.REJECTED, "admin", comment_required=True
    ),
    Action.REQUEST_CHANGES: Rule(
        frozenset({Status.IN_REVIEW}), Status.CHANGES_REQUESTED, "admin", comment_required=True
    ),
}

EDITABLE = frozenset({Status.DRAFT, Status.CHANGES_REQUESTED})


class ItemService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = ItemRepository(db)

    # --- доступ ---
    def _get_visible(self, item_id: int, user: User) -> Item:
        item = self.repo.get(item_id)
        # Чужую запись обычному пользователю не раскрываем: для него её "нет"
        if not item or (user.role != "admin" and item.owner_id != user.id):
            raise NotFoundError("Запись не найдена")
        return item

    # --- CRUD ---
    def create(self, data: ItemCreate, user: User) -> Item:
        item = self.repo.add(
            Item(
                title=data.title.strip(),
                description=data.description,
                amount=data.amount,
                owner_id=user.id,
            )
        )
        self.repo.add_event(
            ItemEvent(
                item_id=item.id,
                actor_id=user.id,
                action="create",
                from_status=None,
                to_status=Status.DRAFT,
            )
        )
        self.db.commit()
        return self.repo.get(item.id)  # type: ignore[return-value]

    def get(self, item_id: int, user: User) -> Item:
        return self._get_visible(item_id, user)

    def list_items(
        self, user: User, *, status: str | None, q: str | None, mine: bool, limit: int, offset: int
    ) -> tuple[list[Item], int]:
        owner_id = user.id if (user.role != "admin" or mine) else None
        items = self.repo.search(owner_id=owner_id, status=status, q=q, limit=limit, offset=offset)
        return items, self.repo.count(owner_id=owner_id, status=status, q=q)

    def update(self, item_id: int, data: ItemUpdate, user: User) -> Item:
        item = self._get_visible(item_id, user)
        if item.owner_id != user.id:
            raise ForbiddenError("Редактировать может только автор")
        if item.status not in EDITABLE:
            raise ConflictError("Запись нельзя редактировать в текущем статусе")
        for field, value in data.model_dump(exclude_unset=True).items():
            if value is not None:
                setattr(
                    item,
                    field,
                    value.strip() if isinstance(value, str) and field == "title" else value,
                )
        # Правка тоже попадает в историю: по ней видно, что менялось после возврата на доработку
        self.repo.add_event(
            ItemEvent(
                item_id=item.id,
                actor_id=user.id,
                action="update",
                from_status=item.status,
                to_status=item.status,
            )
        )
        self.db.commit()
        return self.repo.get(item.id)  # type: ignore[return-value]

    # --- процесс ---
    def transition(self, item_id: int, action: Action, comment: str | None, user: User) -> Item:
        # Сначала блокируем строку, потом читаем статус: иначе два запроса одновременно
        # увидят один и тот же статус и оба пройдут (проверено на PostgreSQL)
        self.repo.lock(item_id)
        item = self._get_visible(item_id, user)
        rule = RULES[action]

        if rule.actor == "owner":
            allowed = item.owner_id == user.id
        else:
            allowed = user.role == "admin"
            if allowed and item.owner_id == user.id:
                # Разделение обязанностей: автор не согласует собственную запись
                raise ForbiddenError("Нельзя согласовывать или отклонять собственную запись")
        if not allowed:
            raise ForbiddenError("Недостаточно прав для этого действия")
        if Status(item.status) not in rule.from_statuses:
            raise ConflictError(f"Действие «{action}» недоступно в статусе «{item.status}»")
        comment = (comment or "").strip() or None
        if rule.comment_required and not comment:
            raise ValidationFailed("Для этого действия нужен комментарий")

        previous = item.status
        item.status = rule.to_status
        # Статус и запись в историю - в одной транзакции: либо оба, либо ни одного
        self.repo.add_event(
            ItemEvent(
                item_id=item.id,
                actor_id=user.id,
                action=action,
                from_status=previous,
                to_status=rule.to_status,
                comment=comment,
            )
        )
        self.db.commit()
        return self.repo.get(item.id)  # type: ignore[return-value]

    def events(self, item_id: int, user: User) -> list[ItemEvent]:
        self._get_visible(item_id, user)
        return self.repo.list_events(item_id)
