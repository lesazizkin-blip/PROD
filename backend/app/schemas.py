"""Контракт API (pydantic), по docs/API.md. Примеры значений попадают в Swagger."""

import re
import uuid
from datetime import date, datetime, time
from enum import StrEnum
from typing import Annotated, Generic, TypeVar

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


class HealthOut(BaseModel):
    status: str
    db: str
    version: str


# ---------- проекты ----------
class QrMode(StrEnum):
    UNIVERSAL = "universal"
    COMPACT = "compact"


class ProjectCreate(BaseModel):
    name: Text120 = Field(examples=["Переезд на Лесную"])
    move_date: date = Field(examples=["2026-11-01"])
    address_from: str | None = Field(default=None, max_length=300)
    address_to: str | None = Field(default=None, max_length=300)
    qr_mode: QrMode = QrMode.UNIVERSAL

    _clean = field_validator("address_from", "address_to")(_opt_text)


class ProjectUpdate(BaseModel):
    name: Text120 | None = None
    move_date: date | None = None
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
    stage: Stage
    title: Text200
    due_date: date | None = None
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
    stage: Stage | None = None
    title: Text200 | None = None
    due_date: date | None = None
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
    room: Text60 = Field(examples=["Кухня"])
    fill_later: bool = False
    remind_at: datetime | None = None
    items_text: str | None = Field(default=None, max_length=20000)


class BoxUpdate(BaseModel):
    room: Text60 | None = None
    fill_later: bool | None = None
    remind_at: datetime | None = None


class BoxOut(BaseModel):
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
    id: int
    box_number: int
    name: str
    lost: bool
    created_at: datetime


class BoxCardOut(BoxOut):
    items: list[ItemOut]


class TransitionIn(BaseModel):
    to: BoxStatus


class ItemCreate(BaseModel):
    name: Text120 = Field(examples=["Чайник"])


class ItemsBulkIn(BaseModel):
    text: str = Field(max_length=20000, examples=["Чайник\nКружки (4 шт)\nТостер"])


class ItemsBulkOut(BaseModel):
    created: list[ItemOut]


class ItemUpdate(BaseModel):
    name: Text120 | None = None
    lost: bool | None = None


class SearchHit(BaseModel):
    item_id: int
    name: str
    lost: bool
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
    title: Text200


class FirstDayUpdate(BaseModel):
    title: Text200 | None = None
    done: bool | None = None


class LostItemOut(BaseModel):
    item: ItemOut
    box_number: int
    room: str
    status: BoxStatus


class HintOut(BaseModel):
    box_number: int
    room: str
    status: BoxStatus
    reason: str  # recorded | similar_content | same_room
    score: float


class ReminderOut(BaseModel):
    box: BoxOut
    overdue: bool


class BulkTransitionIn(BaseModel):
    numbers: list[int] = Field(min_length=1, max_length=200)
    to: BoxStatus


class BulkTransitionOut(BaseModel):
    updated: list[BoxOut]


# ---------- умный чек-лист ----------
class ChecklistIn(BaseModel):
    with_children: bool = False
    with_pets: bool = False
    other_city: bool = False


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
