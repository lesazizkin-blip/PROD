from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import (
    EventOut,
    ItemCreate,
    ItemList,
    ItemOut,
    ItemUpdate,
    Status,
    TransitionIn,
)
from app.services.items import ItemService

router = APIRouter(prefix="/items", tags=["items"])


@router.get("", response_model=ItemList, summary="Список (с фильтрами и пагинацией)")
def list_items(
    status: Status | None = None,
    q: str | None = Query(default=None, max_length=100, description="Поиск по названию и описанию"),
    mine: bool = Query(default=False, description="Только мои (для администратора)"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items, total = ItemService(db).list_items(
        user, status=status.value if status else None, q=q, mine=mine, limit=limit, offset=offset
    )
    return ItemList(items=items, total=total, limit=limit, offset=offset)


@router.post("", response_model=ItemOut, status_code=201, summary="Создать (черновик)")
def create_item(
    body: ItemCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return ItemService(db).create(body, user)


@router.get("/{item_id}", response_model=ItemOut, summary="Получить по id")
def get_item(item_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ItemService(db).get(item_id, user)


@router.patch(
    "/{item_id}", response_model=ItemOut, summary="Изменить (только автор, черновик или доработка)"
)
def update_item(
    item_id: int,
    body: ItemUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ItemService(db).update(item_id, body, user)


@router.post("/{item_id}/transitions", response_model=ItemOut, summary="Перевести в другой статус")
def transition_item(
    item_id: int,
    body: TransitionIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ItemService(db).transition(item_id, body.action, body.comment, user)


@router.get("/{item_id}/events", response_model=list[EventOut], summary="История изменений")
def item_events(
    item_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return ItemService(db).events(item_id, user)
