"""Черновик плана: отделён от проекта и сохраняется только после проверки пользователем."""

from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, model_validator

Short = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class PlanAnswer(BaseModel):
    """Ответ на уточняющий вопрос модели (шаг 1): уходит в генерацию плана (шаг 2)."""

    question: Short
    answer: Short


class PlanRequest(BaseModel):
    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "description": "Переезжаем с кошкой и комнатными растениями",
                    "move_date": "2026-11-01",
                    "consent": True,
                }
            ]
        }
    }

    description: str = Field(min_length=10, max_length=4000)
    move_date: date
    consent: Literal[True]
    # необязательно: ответы на уточняющие вопросы (POST /projects/plan-questions)
    answers: list[PlanAnswer] = Field(default_factory=list, max_length=5)

    @model_validator(mode="after")
    def clean(self):
        self.description = self.description.strip()
        if len(self.description) < 10:
            raise ValueError("Опишите потребности хотя бы в 10 символах")
        return self


class PlanQuestion(BaseModel):
    id: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)]
    question: Short
    options: list[
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
    ] = Field(default_factory=list, max_length=4)


class PlanQuestions(BaseModel):
    """Шаг 1 двухшагового плана: до трёх вопросов, ответы на которые сильнее всего меняют чек-лист."""

    questions: list[PlanQuestion] = Field(default_factory=list, max_length=3)
