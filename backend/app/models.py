import uuid
from datetime import UTC, date, datetime, time

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from app.db import Base


class UTCDateTime(TypeDecorator):
    """Время в UTC с поясом и на SQLite (он хранит без пояса): пишем в UTC, читаем как UTC.
    Иначе GET отдаёт метку без «Z», браузер читает её как местное время, а сравнения сдвигаются."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return (value if value.tzinfo else value.replace(tzinfo=UTC)).astimezone(UTC)

    def process_result_value(self, value, dialect):
        if value is None or value.tzinfo:
            return value
        return value.replace(tzinfo=UTC)


def _now() -> datetime:
    return datetime.now(UTC)


def _fk(target: str, **kw):
    return mapped_column(ForeignKey(target, ondelete="CASCADE"), index=True, **kw)


class User(Base):
    """Учётная запись: только логин и хэш пароля, никаких персональных данных."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(40), unique=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)


class AuthSession(Base):
    """Сессия входа. В базе лежит только SHA-256 токена: утечка базы не даёт войти."""

    __tablename__ = "sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)


class AiUsageBudget(Base):
    """Попытки генерации: общий дневной и персональный часовой счётчики, без текстов."""

    __tablename__ = "ai_usage_budgets"

    bucket: Mapped[str] = mapped_column(String(100), primary_key=True)
    used: Mapped[int] = mapped_column(Integer, default=0)


class ProjectMember(Base):
    """Кто видит проект: владелец (создал) и участники (пришли по приглашению)."""

    __tablename__ = "project_members"
    __table_args__ = (UniqueConstraint("project_id", "user_id", name="uq_project_members"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[uuid.UUID] = _fk("projects.id")
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(10))  # owner | member
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)


class Invite(Base):
    """Приглашение в проект по ссылке. Как и у сессии, хранится только хэш токена."""

    __tablename__ = "invites"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[uuid.UUID] = _fk("projects.id")
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120))
    move_date: Mapped[date] = mapped_column(Date)
    # переезд на несколько дней: последний день (пусто - один день move_date)
    move_date_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    address_from: Mapped[str | None] = mapped_column(String(300), nullable=True)
    address_to: Mapped[str | None] = mapped_column(String(300), nullable=True)
    qr_mode: Mapped[str] = mapped_column(
        String(12), default="universal", server_default="universal"
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)

    tasks: Mapped[list["Task"]] = relationship(cascade="all, delete-orphan", passive_deletes=True)
    boxes: Mapped[list["Box"]] = relationship(cascade="all, delete-orphan", passive_deletes=True)
    first_day_items: Mapped[list["FirstDayItem"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True
    )
    events: Mapped[list["Event"]] = relationship(cascade="all, delete-orphan", passive_deletes=True)


class TaskTemplate(Base):
    __tablename__ = "task_templates"
    __table_args__ = (UniqueConstraint("stage", "title", name="uq_task_templates_stage_title"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    stage: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(200))
    default_offset_days: Mapped[int] = mapped_column(Integer, default=0)


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        UniqueConstraint("project_id", "template_id", name="uq_tasks_project_template"),
        Index("ix_tasks_project_stage", "project_id", "stage"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[uuid.UUID] = _fk("projects.id")
    stage: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(200))
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    assignee: Mapped[str | None] = mapped_column(String(80), nullable=True)
    start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    category: Mapped[str | None] = mapped_column(String(40), nullable=True)
    category_color: Mapped[str | None] = mapped_column(String(7), nullable=True)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    done_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    template_id: Mapped[int | None] = mapped_column(
        ForeignKey("task_templates.id", ondelete="SET NULL"), nullable=True
    )


class Box(Base):
    __tablename__ = "boxes"
    __table_args__ = (
        UniqueConstraint("project_id", "number", name="uq_boxes_project_number"),
        Index("ix_boxes_project_room_status", "project_id", "room", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[uuid.UUID] = _fk("projects.id")
    number: Mapped[int] = mapped_column(Integer)
    room: Mapped[str] = mapped_column(String(60))
    status: Mapped[str] = mapped_column(String(20), default="packing")
    fill_later: Mapped[bool] = mapped_column(Boolean, default=False)
    remind_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now, onupdate=_now)

    items: Mapped[list["Item"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, order_by="Item.id"
    )
    qr_code: Mapped["BoxQrCode | None"] = relationship(passive_deletes="all")


class BoxQrCode(Base):
    """Permanent code registry. Deleted boxes leave a reserved code with no destination."""

    __tablename__ = "box_qr_codes"

    code: Mapped[str] = mapped_column(String(20), primary_key=True)
    box_id: Mapped[int | None] = mapped_column(
        ForeignKey("boxes.id", ondelete="SET NULL"), unique=True, nullable=True
    )


class Item(Base):
    __tablename__ = "items"

    id: Mapped[int] = mapped_column(primary_key=True)
    box_id: Mapped[int] = _fk("boxes.id")
    name: Mapped[str] = mapped_column(String(120))
    name_norm: Mapped[str] = mapped_column(String(120), index=True)
    quantity: Mapped[int] = mapped_column(
        Integer,
        CheckConstraint("quantity BETWEEN 1 AND 9999", name="ck_items_quantity"),
        default=1,
        server_default="1",
    )
    damaged: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    status: Mapped[str] = mapped_column(String(20), default="packed")
    first_day: Mapped[bool] = mapped_column(Boolean, default=False)  # понадобится в первый день
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)


class Expense(Base):
    """Статья бюджета переезда: план и факт в рублях (план - из калькулятора или вручную)."""

    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[uuid.UUID] = _fk("projects.id")
    category: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(120))
    planned: Mapped[int] = mapped_column(Integer, default=0)
    actual: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)


class FirstDayItem(Base):
    __tablename__ = "first_day_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[uuid.UUID] = _fk("projects.id")
    title: Mapped[str] = mapped_column(String(200))
    done: Mapped[bool] = mapped_column(Boolean, default=False)


class Event(Base):
    """Журнал важных событий проекта (раздел 8 ТЗ)."""

    __tablename__ = "events"
    __table_args__ = (Index("ix_events_project_id_id", "project_id", "id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[uuid.UUID] = _fk("projects.id")
    type: Mapped[str] = mapped_column(String(40))
    entity: Mapped[str] = mapped_column(String(20))
    entity_id: Mapped[str] = mapped_column(String(40))
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)


class Tip(Base):
    __tablename__ = "tips"
    __table_args__ = (UniqueConstraint("topic", "title", name="uq_tips_topic_title"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    topic: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)


class CityPrice(Base):
    """Цены на переезд в городе по открытым данным (справочник; заполняется из reference_data.CITY_PRICES)."""

    __tablename__ = "city_prices"

    slug: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(60))
    mover_low: Mapped[int] = mapped_column(
        Integer
    )  # грузчик, ₽/ч: минимум и максимум ставок исполнителей
    mover_high: Mapped[int] = mapped_column(Integer)
    movers_offers: Mapped[int] = mapped_column(Integer)  # сколько исполнителей дали эту вилку
    truck_low: Mapped[int] = mapped_column(Integer)  # Газель с водителем, ₽/ч
    truck_high: Mapped[int] = mapped_column(Integer)
    trucks_offers: Mapped[int] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(String(200))
    checked_on: Mapped[date] = mapped_column(Date)
