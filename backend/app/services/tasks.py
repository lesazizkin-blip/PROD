import uuid
from datetime import UTC, datetime

from sqlalchemy import case, select
from sqlalchemy.orm import Session

from app.errors import NotFoundError, ValidationFailed
from app.models import Project, Task, TaskTemplate
from app.schemas import Stage, TaskCreate, TaskUpdate
from app.services.boxes import lock_project
from app.services.events import log_event

_STAGE_ORDER = case(
    (Task.stage == Stage.BEFORE.value, 0),
    (Task.stage == Stage.MOVING_DAY.value, 1),
    else_=2,
)


class TaskService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_tasks(
        self, project_id: uuid.UUID, stage: Stage | None, done: bool | None
    ) -> list[Task]:
        q = select(Task).where(Task.project_id == project_id)
        if stage is not None:
            q = q.where(Task.stage == stage.value)
        if done is not None:
            q = q.where(Task.done.is_(done))
        # этап, затем срок (без срока в конце), затем id: порядок всегда одинаковый
        q = q.order_by(_STAGE_ORDER, Task.due_date.is_(None), Task.due_date, Task.id)
        return list(self.db.scalars(q))

    def get(self, project_id: uuid.UUID, task_id: int) -> Task:
        task = self.db.get(Task, task_id)
        if not task or task.project_id != project_id:
            raise NotFoundError("Задача не найдена")
        return task

    def create(self, project_id: uuid.UUID, data: TaskCreate) -> Task:
        task = Task(
            project_id=project_id,
            stage=data.stage.value,
            title=data.title,
            due_date=data.due_date,
            start_time=data.start_time,
            end_time=data.end_time,
            category=data.category,
            category_color=data.category_color if data.category else None,
            assignee=data.assignee,
        )
        self.db.add(task)
        self.db.flush()
        log_event(self.db, project_id, "task.created", "task", task.id, title=task.title)
        self.db.commit()
        return task

    def update(self, project_id: uuid.UUID, task_id: int, data: TaskUpdate) -> Task:
        task = self.get(project_id, task_id)
        changes = data.model_dump(exclude_unset=True)
        for required in ("stage", "title", "done"):
            if required in changes and changes[required] is None:
                raise ValidationFailed(f"Поле {required} нельзя очистить")
        done = changes.pop("done", None)
        for field, value in changes.items():
            setattr(task, field, value.value if isinstance(value, Stage) else value)
        # время проверяем по итоговым значениям: в запросе мог прийти только один из двух концов
        if task.start_time and task.end_time and task.end_time <= task.start_time:
            raise ValidationFailed("Время окончания должно быть позже времени начала")
        if not task.category:  # цвет принадлежит категории: без неё цвета нет
            task.category_color = None
        if done is not None and done != task.done:
            task.done = done
            task.done_at = datetime.now(UTC) if done else None
            log_event(
                self.db,
                project_id,
                "task.completed" if done else "task.reopened",
                "task",
                task.id,
                title=task.title,
            )
        self.db.commit()
        return task

    def delete(self, project_id: uuid.UUID, task_id: int) -> None:
        self.db.delete(self.get(project_id, task_id))
        self.db.commit()

    def apply_templates(self, project: Project) -> int:
        """Добавляет шаблонные задачи, которых ещё нет (идемпотентно, по template_id)."""
        lock_project(
            self.db, project.id
        )  # два одновременных нажатия идут по очереди, без дублей и 500
        have = set(
            self.db.scalars(
                select(Task.template_id).where(
                    Task.project_id == project.id, Task.template_id.is_not(None)
                )
            )
        )
        added = 0
        for t in self.db.scalars(select(TaskTemplate).order_by(TaskTemplate.id)):
            if t.id in have:
                continue
            self.db.add(
                Task(
                    project_id=project.id,
                    stage=t.stage,
                    title=t.title,
                    template_id=t.id,
                )
            )
            added += 1
        self.db.commit()
        return added
