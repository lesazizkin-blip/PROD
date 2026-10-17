"""Черновик плана: отделён от проекта и сохраняется только после проверки пользователем."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, model_validator


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

    @model_validator(mode="after")
    def clean(self):
        self.description = self.description.strip()
        if len(self.description) < 10:
            raise ValueError("Опишите потребности хотя бы в 10 символах")
        return self
