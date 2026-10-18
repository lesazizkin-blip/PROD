"""Контракт API (pydantic), по docs/API.md. Примеры значений попадают в Swagger."""

import re
import uuid
from datetime import date, datetime, time, timedelta
from enum import StrEnum
from typing import Annotated, Generic, Literal, TypeVar

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

T = TypeVar("T")


class Stage(StrEnum):
    BEFORE = "before"
    MOVING_DAY = "moving_day"
    AFTER = "after"


class BoxStatus(StrEnum):
    PACKING = "packing"
    PACKED = "packed"
    LOADED = "loaded"
    DELIVERED = "delivered"
    UNPACKED = "unpacked"


class ItemStatus(StrEnum):
    """Состояние вещи. Переходы свободные: вещь может найтись, сломаться или оказаться на месте в любой момент."""

    PACKED = "packed"  # лежит в коробке (по умолчанию)
    UNPACKED = "unpacked"  # распакована, на месте
    LOST = "lost"  # потеряна: для неё есть подсказки, где искать
    FOUND = "found"  # была потеряна и нашлась
    DAMAGED = "damaged"  # повреждена при переезде


class TipTopic(StrEnum):
    FRAGILE = "fragile"
    CARRY_WITH_YOU = "carry_with_you"
    PACK_LAST = "pack_last"


def _opt_text(v: str | None) -> str | None:
    """Пустая строка и пробелы = «не заполнено»."""
    if v is None:
        return None
    v = v.strip()
    return v or None


Text120 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Text200 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Text60 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class ClientConfigOut(BaseModel):
    maps_api_key: str | None = None
    maps_provider: Literal["maptiler", "google"] | None = None


class HealthOut(BaseModel):
    status: str
    db: str
    version: str


class PlanTask(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Text200
    stage: Stage
    offset_days: int = Field(ge=-365, le=365, strict=True)

    @model_validator(mode="after")
    def check_stage(self):
        if (
            (self.stage == Stage.BEFORE and self.offset_days > 0)
            or (self.stage == Stage.MOVING_DAY and self.offset_days != 0)
            or (self.stage == Stage.AFTER and self.offset_days < 0)
        ):
            raise ValueError("Срок задачи должен соответствовать этапу переезда")
        return self


class PersonalPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tasks: list[PlanTask] = Field(min_length=1, max_length=30)
    first_day: list[Text200] = Field(default_factory=list, max_length=20)


# ---------- полный путь переезда: калькулятор и бюджет ----------
ExpenseCategory = Literal[
    "movers", "transport", "materials", "cleaning", "services", "rent", "other"
]


MAX_FLOOR_WITHOUT_ELEVATOR = 15


class CalculatorIn(BaseModel):
    """Параметры переезда для оценки. Доступно после входа, ничего не сохраняется."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "rooms": 2,
                    "people": 3,
                    "distance_km": 15,
                    "floor_from": 5,
                    "floor_to": 9,
                    "elevator_from": True,
                    "elevator_to": True,
                    "pets": True,
                    "piano": False,
                    "many_fragile": True,
                    "move_date": "2026-11-21",
                    "city": "kzn",
                }
            ]
        }
    )
    rooms: int = Field(ge=1, le=8, description="Жилых комнат (студия = 1)")
    # пределы - решение владельца 17.10: до 10 человек, до 500 км (сервис для переезда в городе и регионе)
    people: int = Field(default=2, ge=1, le=10)
    distance_km: int = Field(default=10, ge=0, le=500)
    floor_from: int = Field(default=1, ge=0, le=100)
    floor_to: int = Field(default=1, ge=0, le=100)
    elevator_from: bool = True
    elevator_to: bool = True
    pets: bool = False
    piano: bool = False
    many_fragile: bool = False
    move_date: date | None = None
    # город из GET /api/cities (цены грузчиков и машины); не задан - средние по крупным городам
    city: str | None = Field(default=None, max_length=20)

    @model_validator(mode="after")
    def floors_without_elevator(self):
        # решение владельца 17.10: с лифтом до 100 этажа, без лифта - до 15 (выше без лифта не бывает в жизни,
        # а такие данные давали десятки часов работы)
        for floor, elevator, where in (
            (self.floor_from, self.elevator_from, "сейчас"),
            (self.floor_to, self.elevator_to, "на новом месте"),
        ):
            if not elevator and floor > MAX_FLOOR_WITHOUT_ELEVATOR:
                raise ValueError(
                    f"Этаж {where} без лифта - не выше {MAX_FLOOR_WITHOUT_ELEVATOR}-го; отметьте лифт"
                )
        return self


class Range(BaseModel):
    low: int
    high: int


class CostLine(BaseModel):
    category: ExpenseCategory
    title: str
    cost: Range


class CalculatorOut(BaseModel):
    boxes: Range
    volume_m3: Range
    vehicle: str
    movers: int
    hours: Range
    prep_weeks: int
    costs: list[CostLine]
    total: Range
    date_advice: list[str]
    assumptions: str
    city: str | None = None


class CityOut(ORM):
    slug: str
    name: str


class ExpenseIn(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [{"category": "movers", "title": "Грузчики, 2 человека", "planned": 12000}]
        }
    )
    category: ExpenseCategory = "other"
    title: Text120
    planned: int = Field(default=0, ge=0, le=100_000_000)
    actual: int | None = Field(default=None, ge=0, le=100_000_000)


class ExpenseUpdate(BaseModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{"actual": 13500}]})
    category: ExpenseCategory | None = None
    title: Text120 | None = None
    planned: int | None = Field(default=None, ge=0, le=100_000_000)
    actual: int | None = Field(default=None, ge=0, le=100_000_000)


class ExpenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    category: str
    title: str
    planned: int
    actual: int | None


class BudgetOut(BaseModel):
    items: list[ExpenseOut]
    planned: int
    actual: int
    # отклонение факта от плана по статьям, где факт уже внесён (минус - сэкономили)
    variance: int


# ---------- фото-помощник (черновики модели, в проект попадают только после подтверждения) ----------
class PhotoRequest(BaseModel):
    """Фото как data URL (сайт уменьшает его до 1280 px). consent - явное согласие отправить фото модели."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [{"image": "data:image/jpeg;base64,/9j/4AAQ...", "consent": True}]
        }
    )
    image: str = Field(min_length=32)
    consent: Literal[True]


class RoomPhotoRequest(PhotoRequest):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {"image": "data:image/jpeg;base64,/9j/4AAQ...", "room": "Кухня", "consent": True}
            ]
        }
    )
    room: Text60


class PhotoItem(BaseModel):
    name: Text120
    first_day: bool = False
    fragile: bool = False


class PhotoInventory(BaseModel):
    items: list[PhotoItem] = Field(default_factory=list, max_length=40)


class RoomBox(BaseModel):
    label: Text120
    items: list[Text120] = Field(default_factory=list, max_length=20)
    tip: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] = ""


class RoomPlan(BaseModel):
    room: str = ""
    boxes: list[RoomBox] = Field(default_factory=list, max_length=12)


# ---------- проекты ----------
class QrMode(StrEnum):
    UNIVERSAL = "universal"
    COMPACT = "compact"


# дата переезда: от 2000 до 2100 года (дата 1900 года давала сроки задач в XIX веке)
MoveDate = Annotated[date, Field(ge=date(2000, 1, 1), le=date(2100, 12, 31))]
MAX_MOVE_DAYS = 31  # переезд «с ... по ...» - не дольше месяца


def check_move_dates(start: date, end: date | None) -> None:
    if end is None:
        return
    if end < start:
        raise ValueError("Дата окончания переезда раньше даты начала")
    if (end - start).days >= MAX_MOVE_DAYS:
        raise ValueError(f"Переезд длится не больше {MAX_MOVE_DAYS} дня")


class ProjectCreate(BaseModel):
    name: Text120 = Field(examples=["Переезд на Лесную"])
    move_date: MoveDate = Field(examples=["2026-11-01"], description="Дата переезда (первый день)")
    move_date_end: MoveDate | None = Field(
        default=None,
        examples=["2026-11-03"],
        description="Последний день, если переезд на несколько дней",
    )
    address_from: str | None = Field(default=None, max_length=300)
    address_to: str | None = Field(default=None, max_length=300)
    qr_mode: QrMode = QrMode.UNIVERSAL
    personal_plan: PersonalPlan | None = None
    plan_mode: Literal["standard", "empty"] = "standard"
    first_day: list[Text200] | None = Field(default=None, max_length=20)

    _clean = field_validator("address_from", "address_to")(_opt_text)

    @model_validator(mode="after")
    def check_plan_dates(self):
        check_move_dates(self.move_date, self.move_date_end)
        if self.plan_mode == "empty" and self.personal_plan:
            raise ValueError("Для персонального плана выберите стандартный начальный план")
        if self.plan_mode == "standard":
            try:
                self.move_date + timedelta(days=-14)
                self.move_date + timedelta(days=14)
            except OverflowError:
                raise ValueError("Дата не позволяет рассчитать сроки стандартного плана") from None
        if self.personal_plan:
            try:
                for task in self.personal_plan.tasks:
                    self.move_date + timedelta(days=task.offset_days)
            except OverflowError:
                raise ValueError("Срок задачи выходит за допустимый диапазон дат") from None
        return self


class ProjectUpdate(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [{"name": "Переезд на Садовую", "address_to": "ул. Садовая, 5"}]
        }
    )
    name: Text120 | None = None
    move_date: MoveDate | None = None
    move_date_end: MoveDate | None = None  # null - переезд в один день
    address_from: str | None = Field(default=None, max_length=300)
    address_to: str | None = Field(default=None, max_length=300)
    qr_mode: QrMode | None = None

    _clean = field_validator("address_from", "address_to")(_opt_text)


# ---------- вход и участники ----------
def _username(v: str) -> str:
    """Логин без регистра и пробелов по краям: «Anna » и «anna» - один пользователь."""
    v = v.strip().lower()
    if not re.fullmatch(r"[a-z0-9_.-]{3,40}", v):
        raise ValueError("Логин: 3–40 символов, латиница, цифры, точка, дефис или подчёркивание")
    return v


Username = Annotated[str, AfterValidator(_username)]


class Credentials(BaseModel):
    username: Username = Field(
        examples=["anna"], description="3–40 символов: латиница, цифры, точка, дефис, подчёркивание"
    )
    password: str = Field(min_length=8, max_length=128, examples=["пароль-подлиннее"])


class UserOut(ORM):
    id: int
    username: str


class PasswordChange(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {"current_password": "старый-пароль", "new_password": "новый-пароль-подлиннее"}
            ]
        }
    )
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class MemberOut(BaseModel):
    user_id: int
    username: str
    role: str  # owner | member


class RevokedInvites(BaseModel):
    revoked: int


class ProjectBrief(BaseModel):
    id: uuid.UUID
    name: str
    move_date: date
    move_date_end: date | None = None
    role: str  # owner | member


class InviteOut(BaseModel):
    token: str
    path: str = Field(description="Путь на сайте: /invite/{token}")
    expires_at: datetime


class InviteInfo(BaseModel):
    project_name: str
    expires_at: datetime


class ProjectOut(ORM):
    qr_mode: QrMode
    id: uuid.UUID
    name: str
    move_date: date
    move_date_end: date | None = None
    address_from: str | None
    address_to: str | None
    created_at: datetime


# ---------- задачи ----------
HexColor = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]


def _naive_time(v: time) -> time:
    """Время задачи - местное время дня; с часовым поясом его нельзя сравнить и сохранить в SQLite."""
    if v.tzinfo is not None:
        raise ValueError("Укажите время без часового пояса, например 09:30")
    return v


NaiveTime = Annotated[time, AfterValidator(_naive_time)]


def _check_times(start: time | None, end: time | None) -> None:
    if start is not None and end is not None and end <= start:
        raise ValueError("Время окончания должно быть позже времени начала")


class TaskCreate(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "stage": "before",
                    "title": "Заказать грузчиков",
                    "due_date": "2026-10-25",
                    "start_time": "09:00",
                    "end_time": "12:00",
                    "category": "Грузчики",
                    "category_color": "#f0a04b",
                    "assignee": "Аня",
                }
            ]
        }
    )
    stage: Stage
    title: Text200
    due_date: MoveDate | None = None
    start_time: NaiveTime | None = None
    end_time: NaiveTime | None = None
    category: str | None = Field(default=None, max_length=40)
    category_color: HexColor | None = None
    assignee: str | None = Field(default=None, max_length=80)

    _clean = field_validator("assignee", "category")(_opt_text)

    @model_validator(mode="after")
    def _times(self):
        _check_times(self.start_time, self.end_time)
        return self


class TaskUpdate(BaseModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{"done": True}]})
    stage: Stage | None = None
    title: Text200 | None = None
    due_date: MoveDate | None = None
    start_time: NaiveTime | None = None
    end_time: NaiveTime | None = None
    category: str | None = Field(default=None, max_length=40)
    category_color: HexColor | None = None
    assignee: str | None = Field(default=None, max_length=80)
    done: bool | None = None

    _clean = field_validator("assignee", "category")(_opt_text)

    @model_validator(mode="after")
    def _times(self):
        _check_times(self.start_time, self.end_time)
        return self


class TaskOut(ORM):
    id: int
    project_id: uuid.UUID
    stage: Stage
    title: str
    due_date: date | None
    start_time: time | None
    end_time: time | None
    category: str | None
    category_color: str | None
    assignee: str | None
    done: bool
    done_at: datetime | None
    template_id: int | None


class TaskTemplateOut(ORM):
    id: int
    stage: Stage
    title: str
    default_offset_days: int


class TipOut(ORM):
    id: int
    topic: TipTopic
    title: str
    body: str


class AppliedTemplates(BaseModel):
    added: int


# ---------- коробки и вещи ----------
class BoxCreate(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {"room": "Кухня", "fill_later": False, "items_text": "Чайник\nКружки (4 шт)"}
            ]
        }
    )
    room: Text60 = Field(examples=["Кухня"])
    fill_later: bool = False
    remind_at: datetime | None = None
    items_text: str | None = Field(default=None, max_length=20000)


class BoxUpdate(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={"examples": [{"room": "Гостиная", "fill_later": True}]}
    )
    room: Text60 | None = None
    fill_later: bool | None = None
    remind_at: datetime | None = None


class BoxOut(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "number": 12,
                    "project_id": "00000000-0000-4000-8000-000000000001",
                    "room": "Кухня",
                    "status": "packed",
                    "fill_later": False,
                    "remind_at": None,
                    "items_count": 3,
                    "created_at": "2026-10-17T09:00:00Z",
                    "updated_at": "2026-10-17T09:05:00Z",
                }
            ]
        }
    )
    number: int
    project_id: uuid.UUID
    room: str
    status: BoxStatus
    fill_later: bool
    remind_at: datetime | None
    items_count: int
    created_at: datetime
    updated_at: datetime


class ItemOut(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "id": 77,
                    "box_number": 12,
                    "name": "Чайник",
                    "status": "packed",
                    "lost": False,
                    "first_day": True,
                    "created_at": "2026-10-17T09:00:00Z",
                }
            ]
        }
    )
    id: int
    box_number: int
    name: str
    quantity: int = 1
    status: ItemStatus
    damaged: bool = False
    lost: bool  # то же, что status == "lost"; оставлено для совместимости
    first_day: bool
    created_at: datetime


class BoxCardOut(BoxOut):
    items: list[ItemOut]


class StatusCorrectionIn(BaseModel):
    to: BoxStatus = Field(examples=["packed"])
    # необязательна: назад статус меняется и обычным переходом, без причины
    reason: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] = Field(
        default="", examples=["Ошибочно нажали погрузку"]
    )


class FirstDayBindIn(BaseModel):
    box_number: int = Field(ge=1, le=2_147_483_647, examples=[1])
    name: Text120 | None = None


class TransitionIn(BaseModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{"to": "loaded"}]})
    to: BoxStatus


class ItemCreate(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={"examples": [{"name": "Чайник", "first_day": True, "status": "packed"}]}
    )
    name: Text120 = Field(examples=["Чайник"])
    quantity: int = Field(default=1, ge=1, le=9999, strict=True)
    first_day: bool = False
    status: ItemStatus = ItemStatus.PACKED


class ItemsBulkIn(BaseModel):
    text: str = Field(max_length=20000, examples=["Чайник\nКружки (4 шт)\nТостер"])


class ItemsBulkOut(BaseModel):
    created: list[ItemOut]


class ItemMoveIn(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={"examples": [{"from_box_number": 1, "to_box_number": 2}]}
    )
    from_box_number: int = Field(ge=1, le=2_147_483_647)
    to_box_number: int = Field(ge=1, le=2_147_483_647)


class ItemUpdate(BaseModel):
    damaged: bool | None = None
    model_config = ConfigDict(json_schema_extra={"examples": [{"status": "found"}]})
    name: Text120 | None = None
    quantity: int | None = Field(default=None, ge=1, le=9999, strict=True)

    @field_validator("quantity", mode="before")
    @classmethod
    def quantity_not_null(cls, value):
        if value is None:
            raise ValueError("Укажите целое количество от 1 до 9999")
        return value

    status: ItemStatus | None = Field(default=None, examples=["found"])
    first_day: bool | None = None
    lost: bool | None = Field(
        default=None, description="Устарело: true = status lost, false = status found"
    )


class SearchHit(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "item_id": 77,
                    "name": "Чайник",
                    "item_status": "packed",
                    "lost": False,
                    "box_number": 12,
                    "room": "Кухня",
                    "status": "packed",
                }
            ]
        }
    )
    item_id: int
    name: str
    quantity: int = 1
    item_status: ItemStatus
    lost: bool
    damaged: bool = False
    box_number: int
    room: str
    status: BoxStatus


class LabelOut(BaseModel):
    qr_payload: str | None = None
    number: int
    room: str
    project_name: str
    qr_path: str
    items_preview: list[str]


class ResolveCodeIn(BaseModel):
    model_config = {"json_schema_extra": {"examples": [{"code": "MM1:ABCDEFGHIJKLMNOP"}]}}

    code: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^MM1:[A-Z2-7]{16}$")]


class ResolvedBoxOut(BaseModel):
    project_id: uuid.UUID
    box_number: int


# ---------- прогресс ----------
class RoomProgress(BaseModel):
    room: str
    total: int
    by_status: dict[str, int]
    loaded: int
    loaded_percent: float
    unpacked: int
    unpacked_percent: float


class ProgressOut(BaseModel):
    boxes_total: int
    by_status: dict[str, int]
    unpacked_percent: float
    rooms: list[RoomProgress]
    coverage: float


# ---------- события ----------
class EventOut(ORM):
    id: int
    type: str
    entity: str
    entity_id: str
    data: dict
    created_at: datetime


# ---------- чек-лист первого дня, потерянные вещи, напоминания ----------
class FirstDayOut(ORM):
    id: int
    title: str
    done: bool


class FirstDayCreate(BaseModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{"title": "Зарядка для телефона"}]})
    title: Text200


class FirstDayUpdate(BaseModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{"done": True}]})
    title: Text200 | None = None
    done: bool | None = None


class ItemInBoxOut(BaseModel):
    """Вещь вместе с коробкой, комнатой и статусом коробки (списки потерянных и вещей первого дня)."""

    item: ItemOut
    box_number: int
    room: str
    status: BoxStatus


LostItemOut = ItemInBoxOut


class HintOut(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "box_number": 7,
                    "room": "Кухня",
                    "status": "delivered",
                    "reason": "same_room",
                    "score": 0.6,
                }
            ]
        }
    )
    box_number: int
    room: str
    status: BoxStatus
    reason: str  # recorded | similar_content | same_room
    score: float


class ReminderOut(BaseModel):
    box: BoxOut
    overdue: bool


class BulkTransitionIn(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={"examples": [{"numbers": [1, 2, 3], "to": "loaded"}]}
    )
    numbers: list[Annotated[int, Field(ge=1, le=2_147_483_647)]] = Field(
        min_length=1, max_length=200
    )
    to: BoxStatus


class BulkTransitionOut(BaseModel):
    updated: list[BoxOut]


# ---------- умный чек-лист ----------
class ChecklistIn(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {"with_children": True, "with_pets": False, "other_city": True, "renting": True}
            ]
        }
    )
    with_children: bool = False
    with_pets: bool = False
    other_city: bool = False
    # этапы полного пути переезда: новое жильё (аренда), документы, разбор вещей, обжиться
    renting: bool = False
    paperwork: bool = False
    declutter: bool = False
    settling: bool = False


class SuggestedTask(BaseModel):
    stage: Stage
    title: str
    reason: str  # with_children | with_pets | other_city


class ChecklistOut(BaseModel):
    suggested_tasks: list[SuggestedTask]
    suggested_first_day: list[str]


class ChecklistApplied(BaseModel):
    added_tasks: int
    added_first_day: int
