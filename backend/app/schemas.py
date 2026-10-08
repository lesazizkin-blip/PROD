"""Контракт API (pydantic). Примеры значений попадают в Swagger."""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class Status(StrEnum):
    DRAFT = "draft"
    IN_REVIEW = "in_review"
    CHANGES_REQUESTED = "changes_requested"
    APPROVED = "approved"
    REJECTED = "rejected"


class Action(StrEnum):
    SUBMIT = "submit"
    APPROVE = "approve"
    REJECT = "reject"
    REQUEST_CHANGES = "request_changes"


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- auth ----------
class RegisterIn(BaseModel):
    email: EmailStr = Field(examples=["ivan@example.com"])
    full_name: str = Field(min_length=2, max_length=100, examples=["Иван Петров"])
    password: str = Field(min_length=8, max_length=128, examples=["qwerty123"])


class LoginIn(BaseModel):
    email: EmailStr = Field(examples=["ivan@example.com"])
    password: str = Field(min_length=1, max_length=128, examples=["qwerty123"])


class UserOut(ORM):
    id: int
    email: str
    full_name: str
    role: str
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- items ----------
class ItemCreate(BaseModel):
    title: str = Field(min_length=3, max_length=120, examples=["Кэшбэк 10% на кофе"])
    description: str = Field(default="", max_length=2000, examples=["Для всех кофеен-партнёров"])
    amount: int = Field(default=0, ge=0, le=1_000_000_000, examples=[50000])


class ItemUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    amount: int | None = Field(default=None, ge=0, le=1_000_000_000)


class ItemOut(ORM):
    id: int
    title: str
    description: str
    amount: int
    status: Status
    owner_id: int
    owner_name: str
    created_at: datetime
    updated_at: datetime


class ItemList(BaseModel):
    items: list[ItemOut]
    total: int
    limit: int
    offset: int


class TransitionIn(BaseModel):
    action: Action = Field(examples=["submit"])
    comment: str | None = Field(default=None, max_length=500, examples=["Поправьте описание"])


class EventOut(ORM):
    id: int
    item_id: int
    actor_id: int
    actor_name: str
    action: str
    from_status: str | None
    to_status: str
    comment: str | None
    created_at: datetime
