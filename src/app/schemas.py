"""Контракт API. Под свой кейс меняется здесь + в params.yaml (features)."""

from typing import Literal

from pydantic import BaseModel, Field

Role = Literal["backend", "frontend", "ml_engineer", "data_analyst", "qa"]
Region = Literal["moscow", "spb", "kazan", "novosibirsk", "other"]
Education = Literal["school", "college", "bachelor", "master"]


class PredictRequest(BaseModel):
    role: Role = Field(examples=["backend"])
    region: Region = Field(examples=["moscow"])
    education: Education | None = Field(default=None, examples=["bachelor"])
    experience_years: float | None = Field(default=None, ge=0, le=50, examples=[3.5])
    skills_count: int | None = Field(default=None, ge=0, le=100, examples=[8])
    company_size: int = Field(default=200, ge=1, le=1_000_000, examples=[200])
    remote: Literal[0, 1] = Field(default=0, examples=[1])


class PredictResponse(BaseModel):
    prediction: float = Field(description="Медианная оценка")
    low: float | None = Field(default=None, description="Нижняя граница вилки")
    high: float | None = Field(default=None, description="Верхняя граница вилки")
    model_version: str
    request_id: str


class BatchRequest(BaseModel):
    items: list[PredictRequest] = Field(min_length=1, max_length=1000)


class BatchResponse(BaseModel):
    predictions: list[PredictResponse]


class HealthResponse(BaseModel):
    status: Literal["ok"]
    model_loaded: bool
    model_version: str
