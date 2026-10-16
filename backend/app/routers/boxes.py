from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import PageParams, get_project
from app.models import Project
from app.routers.common import confirm_param
from app.schemas import (
    BoxCardOut,
    BoxCreate,
    BoxOut,
    BoxStatus,
    BoxUpdate,
    ItemCreate,
    ItemOut,
    ItemsBulkIn,
    ItemsBulkOut,
    ItemUpdate,
    LabelOut,
    Page,
    ProgressOut,
    SearchHit,
    TransitionIn,
)
from app.services.boxes import BoxService, parse_lines

router = APIRouter(prefix="/projects/{pid}", tags=["boxes"])


@router.get("/boxes", response_model=Page[BoxOut], summary="Коробки (фильтры, пагинация)")
def list_boxes(
    room: str | None = None,
    status: BoxStatus | None = None,
    fill_later: bool | None = None,
    number: int | None = Query(default=None, ge=1),
    page: PageParams = Depends(),
    project: Project = Depends(get_project),
    db: Session = Depends(get_db),
):
    items, total = BoxService(db).list_boxes(
        project.id,
        room=room,
        status=status,
        fill_later=fill_later,
        number=number,
        offset=page.offset,
        limit=page.page_size,
    )
    return Page(items=items, total=total, page=page.page, page_size=page.page_size)


@router.post(
    "/boxes",
    response_model=BoxOut,
    status_code=201,
    summary="Создать коробку (номер выдаёт сервер)",
)
def create_box(
    body: BoxCreate, project: Project = Depends(get_project), db: Session = Depends(get_db)
):
    return BoxService(db).create(project.id, body)


@router.get("/boxes/{n}", response_model=BoxCardOut, summary="Карточка коробки (её открывает QR)")
def get_box(n: int, project: Project = Depends(get_project), db: Session = Depends(get_db)):
    return BoxService(db).card(project.id, n)


@router.patch("/boxes/{n}", response_model=BoxOut, summary="Изменить комнату или «заполнить позже»")
def update_box(
    n: int, body: BoxUpdate, project: Project = Depends(get_project), db: Session = Depends(get_db)
):
    return BoxService(db).update(project.id, n, body)


@router.delete("/boxes/{n}", status_code=204, summary="Удалить коробку с вещами (confirm=true)")
def delete_box(
    n: int,
    project: Project = Depends(get_project),
    _=Depends(confirm_param),
    db: Session = Depends(get_db),
):
    BoxService(db).delete(project.id, n)
    return Response(status_code=204)


@router.post(
    "/boxes/{n}/transitions",
    response_model=BoxOut,
    summary="Сменить статус по допустимым переходам",
)
def transition(
    n: int,
    body: TransitionIn,
    project: Project = Depends(get_project),
    db: Session = Depends(get_db),
):
    return BoxService(db).transition(project.id, n, body.to)


@router.get(
    "/boxes/{n}/label", response_model=LabelOut, summary="Данные этикетки (QR строит приложение)"
)
def label(n: int, project: Project = Depends(get_project), db: Session = Depends(get_db)):
    return BoxService(db).label(project, n)


# ---------- вещи ----------
@router.get("/boxes/{n}/items", response_model=Page[ItemOut], summary="Вещи в коробке")
def list_items(
    n: int,
    page: PageParams = Depends(),
    project: Project = Depends(get_project),
    db: Session = Depends(get_db),
):
    card = BoxService(db).card(project.id, n)
    chunk = card.items[page.offset : page.offset + page.page_size]
    return Page(items=chunk, total=len(card.items), page=page.page, page_size=page.page_size)


@router.post("/boxes/{n}/items", response_model=ItemOut, status_code=201, summary="Добавить вещь")
def add_item(
    n: int, body: ItemCreate, project: Project = Depends(get_project), db: Session = Depends(get_db)
):
    return BoxService(db).add_items(project.id, n, [body.name])[0]


@router.post(
    "/boxes/{n}/items/bulk",
    response_model=ItemsBulkOut,
    status_code=201,
    summary="Быстрый ввод: строка = вещь",
)
def add_items_bulk(
    n: int,
    body: ItemsBulkIn,
    project: Project = Depends(get_project),
    db: Session = Depends(get_db),
):
    return {"created": BoxService(db).add_items(project.id, n, parse_lines(body.text))}


@router.patch(
    "/items/{item_id}", response_model=ItemOut, summary="Переименовать / пометить потерянной"
)
def update_item(
    item_id: int,
    body: ItemUpdate,
    project: Project = Depends(get_project),
    db: Session = Depends(get_db),
):
    return BoxService(db).update_item(project.id, item_id, body.name, body.lost)


@router.delete("/items/{item_id}", status_code=204, summary="Удалить вещь (confirm=true)")
def delete_item(
    item_id: int,
    project: Project = Depends(get_project),
    _=Depends(confirm_param),
    db: Session = Depends(get_db),
):
    BoxService(db).delete_item(project.id, item_id)
    return Response(status_code=204)


# ---------- поиск и прогресс ----------
@router.get(
    "/search", response_model=Page[SearchHit], summary="Поиск вещи по названию среди всех коробок"
)
def search(
    q: str = Query(min_length=1, max_length=120),
    page: PageParams = Depends(),
    project: Project = Depends(get_project),
    db: Session = Depends(get_db),
):
    hits, total = BoxService(db).search(project.id, q, page.offset, page.page_size)
    return Page(items=hits, total=total, page=page.page, page_size=page.page_size)


@router.get(
    "/progress", response_model=ProgressOut, summary="Коробки по статусам и прогресс по комнатам"
)
def progress(project: Project = Depends(get_project), db: Session = Depends(get_db)):
    return BoxService(db).progress(project.id)
