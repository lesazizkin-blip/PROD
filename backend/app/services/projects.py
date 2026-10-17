import uuid
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import ValidationFailed
from app.logging_setup import audit
from app.models import FirstDayItem, Project, ProjectMember, Task, TaskTemplate
from app.reference_data import FIRST_DAY_BASICS
from app.schemas import ProjectCreate, ProjectUpdate
from app.services.events import log_event


class ProjectService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(
        self, data: ProjectCreate, project_id: uuid.UUID | None = None, owner_id: int | None = None
    ) -> Project:
        project = Project(
            name=data.name,
            move_date=data.move_date,
            address_from=data.address_from,
            address_to=data.address_to,
            qr_mode=data.qr_mode.value,
        )
        if project_id:
            project.id = project_id
        self.db.add(project)
        self.db.flush()
        if data.plan_mode == "standard":
            for template in self.db.scalars(select(TaskTemplate).order_by(TaskTemplate.id)):
                self.db.add(
                    Task(
                        project_id=project.id,
                        stage=template.stage,
                        title=template.title,
                        due_date=project.move_date + timedelta(days=template.default_offset_days),
                        template_id=template.id,
                    )
                )

        if data.personal_plan:
            # Всё сохраняется одной транзакцией вместе с шаблонами и владельцем.
            def normalize(title: str) -> str:
                return " ".join(title.casefold().split())

            have_tasks = {normalize(title) for title in self.db.scalars(select(TaskTemplate.title))}
            for task in data.personal_plan.tasks:
                if normalize(task.title) in have_tasks:
                    continue
                have_tasks.add(normalize(task.title))
                self.db.add(
                    Task(
                        project_id=project.id,
                        title=task.title,
                        stage=task.stage.value,
                        due_date=project.move_date + timedelta(days=task.offset_days),
                    )
                )
        if data.plan_mode == "standard":
            titles = [
                *(data.first_day if data.first_day is not None else FIRST_DAY_BASICS),
                *(data.personal_plan.first_day if data.personal_plan else []),
            ]
            seen: set[str] = set()
            for title in titles:
                key = " ".join(title.casefold().split())
                if key not in seen:
                    seen.add(key)
                    self.db.add(FirstDayItem(project_id=project.id, title=title))
        if owner_id is not None:  # владелец добавляется в той же транзакции, что и проект
            self.db.add(ProjectMember(project_id=project.id, user_id=owner_id, role="owner"))
        log_event(self.db, project.id, "project.created", "project", project.id, name=project.name)
        self.db.commit()
        return project

    def update(self, project: Project, data: ProjectUpdate) -> Project:
        changes = data.model_dump(exclude_unset=True)
        for required in ("name", "move_date", "qr_mode"):
            if required in changes and changes[required] is None:
                raise ValidationFailed(f"Поле {required} нельзя очистить")
        if changes.get("move_date") and changes["move_date"] != project.move_date:
            # сроки задач стандартного плана считаются от даты переезда: сдвигаем невыполненные
            shift = changes["move_date"] - project.move_date
            for task in self.db.scalars(
                select(Task).where(
                    Task.project_id == project.id,
                    Task.template_id.is_not(None),
                    Task.done.is_(False),
                    Task.due_date.is_not(None),
                )
            ):
                task.due_date = task.due_date + shift
        for field, value in changes.items():
            setattr(project, field, value)
        log_event(
            self.db, project.id, "project.updated", "project", project.id, fields=sorted(changes)
        )
        self.db.commit()
        return project

    def delete(self, project: Project) -> None:
        audit("project.deleted", project_id=project.id)
        self.db.delete(project)  # каскадом уходит всё содержимое (и журнал вместе с ним)
        self.db.commit()
