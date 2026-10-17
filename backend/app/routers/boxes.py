from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import PageParams, get_current_user, get_project
from app.errors import ValidationFailed
from app.models import Project, User
from app.routers.common import MAX_INT, Id, confirm_param
from app.schemas import (
    BoxCardOut,
    BoxCreate,
    BoxOut,
    BoxStatus,
    BoxUpdate,
    BulkTransitionIn,
    BulkTransitionOut,
    FirstDayBindIn,
    FirstDayCreate,
    FirstDayOut,
    FirstDayUpdate,
    HintOut,
    ItemCreate,
    ItemMoveIn,
    ItemOut,
    ItemsBulkIn,
    ItemsBulkOut,
    ItemUpdate,
    LabelOut,
    LostItemOut,
    Page,
    ProgressOut,
    ReminderOut,
    SearchHit,
    StatusCorrectionIn,
    TransitionIn,
)
from app.services.boxes import BoxService, parse_lines
from app.services.extras import FirstDayService, LostService, reminders

router = APIRouter(prefix="/projects/{pid}", tags=["boxes"])


@router.get("/boxes", response_model=Page[BoxOut], summary="Коробки (фильтры, пагинация)")
def list_boxes(
    room: str | None = None,
    status: BoxStatus | None = None,
    fill_later: bool | None = None,
    number: int | None = Query(default=None, ge=1, le=MAX_INT),
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
def get_box(n: Id, project: Project = Depends(get_project), db: Session = Depends(get_db)):
    return BoxService(db).card(project.id, n)


@router.patch("/boxes/{n}", response_model=BoxOut, summary="Изменить комнату или «заполнить позже»")
def update_box(
    n: Id, body: BoxUpdate, project: Project = Depends(get_project), db: Session = Depends(get_db)
):
    return BoxService(db).update(project.id, n, body)


@router.delete("/boxes/{n}", status_code=204, summary="Удалить коробку с вещами (confirm=true)")
def delete_box(
    n: Id,
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
    n: Id,
    body: TransitionIn,
    project: Project = Depends(get_project),
    db: Session = Depends(get_db),
):
    return BoxService(db).transition(project.id, n, body.to)


@router.get(
    "/boxes/{n}/label", response_model=LabelOut, summary="Данные этикетки (QR строит приложение)"
)
def label(n: Id, project: Project = Depends(get_project), db: Session = Depends(get_db)):
    return BoxService(db).label(project, n)


@router.get(
    "/labels",
    response_model=list[LabelOut],
    summary="Пакет этикеток для печати (numbers=1,2,3; без параметра - все)",
)
def labels(
    numbers: str | None = Query(
        default=None, description="Номера коробок через запятую, не больше 100"
    ),
    project: Project = Depends(get_project),
    db: Session = Depends(get_db),
):
    parsed = None
    if numbers is not None:
        try:
            parsed = [int(x) for x in numbers.split(",") if x.strip()]
        except ValueError:
            raise ValidationFailed("numbers: ожидается список целых чисел через запятую") from None
        if not parsed or len(parsed) > 100 or not all(1 <= x <= MAX_INT for x in parsed):
            raise ValidationFailed("numbers: от 1 до 100 номеров")
    return BoxService(db).labels(project, parsed)


# ---------- вещи ----------
@router.get("/boxes/{n}/items", response_model=Page[ItemOut], summary="Вещи в коробке")
def list_items(
    n: Id,
    page: PageParams = Depends(),
    project: Project = Depends(get_project),
    db: Session = Depends(get_db),
):
    card = BoxService(db).card(project.id, n)
    chunk = card.items[page.offset : page.offset + page.page_size]
    return Page(items=chunk, total=len(card.items), page=page.page, page_size=page.page_size)


@router.post("/boxes/{n}/items", response_model=ItemOut, status_code=201, summary="Добавить вещь")
def add_item(
    n: Id, body: ItemCreate, project: Project = Depends(get_project), db: Session = Depends(get_db)
):
    return BoxService(db).add_items(project.id, n, [body.name], body.first_day, body.status)[0]


@router.post(
    "/boxes/{n}/items/bulk",
    response_model=ItemsBulkOut,
    status_code=201,
    summary="Быстрый ввод: строка = вещь",
)
def add_items_bulk(
    n: Id,
    body: ItemsBulkIn,
    project: Project = Depends(get_project),
    db: Session = Depends(get_db),
):
    names = parse_lines(body.text)
    if not names:
        raise ValidationFailed("Нет ни одной вещи: напишите по вещи на строку")
    return {"created": BoxService(db).add_items(project.id, n, names)}


@router.patch(
    "/items/{item_id}", response_model=ItemOut, summary="Переименовать / пометить потерянной"
)
def update_item(
    item_id: Id,
    body: ItemUpdate,
    project: Project = Depends(get_project),
    db: Session = Depends(get_db),
):
    return BoxService(db).update_item(
        project.id, item_id, body.name, body.status, body.lost, body.first_day, body.damaged
    )


@router.post(
    "/items/{item_id}/move",
    response_model=ItemOut,
    summary="Переложить вещь в другую коробку проекта",
)
def move_item(
    item_id: Id,
    body: ItemMoveIn,
    project: Project = Depends(get_project),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return BoxService(db).move_item(
        project.id, item_id, body.from_box_number, body.to_box_number, user.id
    )


@router.delete("/items/{item_id}", status_code=204, summary="Удалить вещь (confirm=true)")
def delete_item(
    item_id: Id,
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
    room: str | None = None,
    page: PageParams = Depends(),
    project: Project = Depends(get_project),
    db: Session = Depends(get_db),
):
    hits, total = BoxService(db).search(project.id, q, page.offset, page.page_size, room)
    return Page(items=hits, total=total, page=page.page, page_size=page.page_size)


@router.get(
    "/progress", response_model=ProgressOut, summary="Коробки по статусам и прогресс по комнатам"
)
def progress(project: Project = Depends(get_project), db: Session = Depends(get_db)):
    return BoxService(db).progress(project.id)


@router.post(
    "/boxes/bulk-transitions",
    response_model=BulkTransitionOut,
    summary="Массовая смена статуса (погрузка комнаты), всё или ничего",
)
def bulk_transition(
    body: BulkTransitionIn, project: Project = Depends(get_project), db: Session = Depends(get_db)
):
    return {"updated": BoxService(db).bulk_transition(project.id, body.numbers, body.to)}


# ---------- чек-лист первого дня ----------
@router.get("/first-day", response_model=list[FirstDayOut], summary="Чек-лист первого дня")
def first_day(project: Project = Depends(get_project), db: Session = Depends(get_db)):
    return FirstDayService(db).list_items(project.id)


@router.post("/first-day", response_model=FirstDayOut, status_code=201, summary="Добавить пункт")
def add_first_day(
    body: FirstDayCreate, project: Project = Depends(get_project), db: Session = Depends(get_db)
):
    return FirstDayService(db).create(project.id, body.title)


@router.patch(
    "/first-day/{item_id}", response_model=FirstDayOut, summary="Отметить / переименовать пункт"
)
def update_first_day(
    item_id: Id,
    body: FirstDayUpdate,
    project: Project = Depends(get_project),
    db: Session = Depends(get_db),
):
    return FirstDayService(db).update(project.id, item_id, body.model_dump(exclude_unset=True))


@router.delete("/first-day/{item_id}", status_code=204, summary="Удалить пункт (confirm=true)")
def delete_first_day(
    item_id: Id,
    project: Project = Depends(get_project),
    _=Depends(confirm_param),
    db: Session = Depends(get_db),
):
    FirstDayService(db).delete(project.id, item_id)
    return Response(status_code=204)


# ---------- потерянные вещи и напоминания ----------
@router.get("/items/lost", response_model=list[LostItemOut], summary="Потерянные вещи")
def lost_items(project: Project = Depends(get_project), db: Session = Depends(get_db)):
    return LostService(db).lost_items(project.id)


@router.get(
    "/items/first-day",
    response_model=list[LostItemOut],
    summary="Вещи первого дня: с коробкой, комнатой и статусом",
)
def first_day_items(project: Project = Depends(get_project), db: Session = Depends(get_db)):
    return LostService(db).first_day_items(project.id)


@router.get(
    "/items/{item_id}/hints",
    response_model=list[HintOut],
    summary="В каких нераспакованных коробках искать вещь",
)
def hints(item_id: Id, project: Project = Depends(get_project), db: Session = Depends(get_db)):
    return LostService(db).hints(project.id, item_id)


@router.get(
    "/reminders",
    response_model=list[ReminderOut],
    summary="Коробки, которые пора описать («заполнить позже»)",
)
def reminders_(project: Project = Depends(get_project), db: Session = Depends(get_db)):
    return reminders(db, project.id)


@router.post(
    "/boxes/{n}/status-corrections",
    response_model=BoxOut,
    summary="Исправить ошибочную отметку: вернуть на более ранний этап с причиной",
)
def correct_status(
    n: Id,
    body: StatusCorrectionIn,
    project: Project = Depends(get_project),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return BoxService(db).correct_status(project.id, n, body.to, body.reason, user.id)


@router.post(
    "/first-day/{item_id}/bind",
    response_model=ItemOut,
    summary="Переместить пункт первого дня в коробку одной транзакцией",
)
def bind_first_day(
    item_id: Id,
    body: FirstDayBindIn,
    project: Project = Depends(get_project),
    db: Session = Depends(get_db),
):
    return FirstDayService(db).bind(project.id, item_id, body.box_number, body.name)
