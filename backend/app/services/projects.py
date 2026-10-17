import uuid

from sqlalchemy.orm import Session

from app.errors import ValidationFailed
from app.logging_setup import audit
from app.models import Project, ProjectMember
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
        )
        if project_id:
            project.id = project_id
        self.db.add(project)
        self.db.flush()
        # план не заполняется сам: шаблоны задач добавляет пользователь кнопкой (POST …/tasks/apply-templates)
        # чек-лист первого дня не заполняется заранее: в нём вещи, которые пользователь сам отметит «Первый день»
        if owner_id is not None:  # владелец добавляется в той же транзакции, что и проект
            self.db.add(ProjectMember(project_id=project.id, user_id=owner_id, role="owner"))
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
        audit("project.deleted", project_id=project.id)
        self.db.delete(project)  # каскадом уходит всё содержимое (и журнал вместе с ним)
        self.db.commit()
