import uuid
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import ValidationFailed
from app.models import FirstDayItem, Project, Task, TaskTemplate
from app.reference_data import FIRST_DAY
from app.schemas import ProjectCreate, ProjectUpdate
from app.services.events import log_event


class ProjectService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, data: ProjectCreate, project_id: uuid.UUID | None = None) -> Project:
        project = Project(
            name=data.name,
            move_date=data.move_date,
            address_from=data.address_from,
            address_to=data.address_to,
        )
        if project_id:
            project.id = project_id
        self.db.add(project)
        self.db.flush()
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
        for title in FIRST_DAY:
            self.db.add(FirstDayItem(project_id=project.id, title=title))
        log_event(self.db, project.id, "project.created", "project", project.id, name=project.name)
        self.db.commit()
        return project

    def update(self, project: Project, data: ProjectUpdate) -> Project:
        changes = data.model_dump(exclude_unset=True)
        for required in ("name", "move_date"):
            if required in changes and changes[required] is None:
                raise ValidationFailed(f"Поле {required} нельзя очистить")
        for field, value in changes.items():
            setattr(project, field, value)
        log_event(
            self.db, project.id, "project.updated", "project", project.id, fields=sorted(changes)
        )
        self.db.commit()
        return project

    def delete(self, project: Project) -> None:
        self.db.delete(project)  # каскадом уходит всё содержимое (и журнал вместе с ним)
        self.db.commit()
