"""Умный чек-лист: подбирает задачи и пункты «коробки первого дня» по особенностям переезда.
Работает на локальных правилах (reference_data.ASSISTANT_RULES), без внешних вызовов."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import FirstDayItem, Project, Task
from app.reference_data import ASSISTANT_RULES
from app.schemas import ChecklistApplied, ChecklistIn, ChecklistOut, Stage, SuggestedTask
from app.services.boxes import lock_project
from app.services.events import log_event


def _norm(title: str) -> str:
    return " ".join(title.lower().split())


class AssistantService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _selected(self, flags: ChecklistIn) -> list[str]:
        return [name for name in ASSISTANT_RULES if getattr(flags, name)]

    def suggest(self, project: Project, flags: ChecklistIn) -> ChecklistOut:
        """Что предлагается добавить: то, чего в проекте ещё нет (по названию)."""
        have_tasks = {
            _norm(t)
            for t in self.db.scalars(select(Task.title).where(Task.project_id == project.id))
        }
        have_first = {
            _norm(t)
            for t in self.db.scalars(
                select(FirstDayItem.title).where(FirstDayItem.project_id == project.id)
            )
        }
        tasks, first_day = [], []
        for reason in self._selected(flags):
            rules = ASSISTANT_RULES[reason]
            for stage, title, _offset in rules["tasks"]:
                if _norm(title) not in have_tasks:
                    have_tasks.add(_norm(title))  # одно и то же из двух правил не предлагаем дважды
                    tasks.append(SuggestedTask(stage=Stage(stage), title=title, reason=reason))
            for title in rules["first_day"]:
                if _norm(title) not in have_first:
                    have_first.add(_norm(title))
                    first_day.append(title)
        return ChecklistOut(suggested_tasks=tasks, suggested_first_day=first_day)

    def apply(self, project: Project, flags: ChecklistIn) -> ChecklistApplied:
        """Добавляет предложенное. Повторный вызов ничего не дублирует."""
        lock_project(self.db, project.id)  # параллельный вызов ждёт и видит уже добавленное
        suggestion = self.suggest(project, flags)
        for s in suggestion.suggested_tasks:
            self.db.add(
                Task(
                    project_id=project.id,
                    stage=s.stage.value,
                    title=s.title,
                )
            )
        for title in suggestion.suggested_first_day:
            self.db.add(FirstDayItem(project_id=project.id, title=title))
        if suggestion.suggested_tasks or suggestion.suggested_first_day:
            log_event(
                self.db,
                project.id,
                "assistant.checklist_applied",
                "project",
                project.id,
                tasks=len(suggestion.suggested_tasks),
                first_day=len(suggestion.suggested_first_day),
            )
        self.db.commit()
        return ChecklistApplied(
            added_tasks=len(suggestion.suggested_tasks),
            added_first_day=len(suggestion.suggested_first_day),
        )
