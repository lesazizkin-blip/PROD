from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import PageParams, get_project
from app.models import Event, Project
from app.routers.common import confirm_param
from app.schemas import (
    AppliedTemplates,
    EventOut,
    Page,
    ProjectCreate,
    ProjectOut,
    ProjectUpdate,
    Stage,
    TaskCreate,
    TaskOut,
    TaskUpdate,
)
from app.services.projects import ProjectService
from app.services.tasks import TaskService

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post(
    "", response_model=ProjectOut, status_code=201, summary="Создать проект (с шаблонами задач)"
)
def create_project(body: ProjectCreate, db: Session = Depends(get_db)):
    return ProjectService(db).create(body)


@router.get("/{pid}", response_model=ProjectOut, summary="Получить проект")
def get_project_(project: Project = Depends(get_project)):
    return project


@router.patch("/{pid}", response_model=ProjectOut, summary="Изменить проект")
def update_project(
    body: ProjectUpdate, project: Project = Depends(get_project), db: Session = Depends(get_db)
):
    return ProjectService(db).update(project, body)


@router.delete(
    "/{pid}", status_code=204, summary="Удалить проект со всем содержимым (confirm=true)"
)
def delete_project(
    project: Project = Depends(get_project), _=Depends(confirm_param), db: Session = Depends(get_db)
):
    ProjectService(db).delete(project)
    return Response(status_code=204)


# ---------- задачи ----------
@router.get("/{pid}/tasks", response_model=list[TaskOut], summary="Задачи (фильтры stage, done)")
def list_tasks(
    stage: Stage | None = None,
    done: bool | None = None,
    project: Project = Depends(get_project),
    db: Session = Depends(get_db),
):
    return TaskService(db).list_tasks(project.id, stage, done)


@router.post(
    "/{pid}/tasks", response_model=TaskOut, status_code=201, summary="Добавить свою задачу"
)
def create_task(
    body: TaskCreate, project: Project = Depends(get_project), db: Session = Depends(get_db)
):
    return TaskService(db).create(project.id, body)


@router.patch(
    "/{pid}/tasks/{tid}", response_model=TaskOut, summary="Изменить задачу / отметить выполнение"
)
def update_task(
    tid: int,
    body: TaskUpdate,
    project: Project = Depends(get_project),
    db: Session = Depends(get_db),
):
    return TaskService(db).update(project.id, tid, body)


@router.delete("/{pid}/tasks/{tid}", status_code=204, summary="Удалить задачу (confirm=true)")
def delete_task(
    tid: int,
    project: Project = Depends(get_project),
    _=Depends(confirm_param),
    db: Session = Depends(get_db),
):
    TaskService(db).delete(project.id, tid)
    return Response(status_code=204)


@router.post(
    "/{pid}/tasks/apply-templates",
    response_model=AppliedTemplates,
    summary="Добавить недостающие шаблонные задачи",
)
def apply_templates(project: Project = Depends(get_project), db: Session = Depends(get_db)):
    return {"added": TaskService(db).apply_templates(project)}


# ---------- журнал событий ----------
@router.get("/{pid}/events", response_model=Page[EventOut], summary="Журнал событий (новые сверху)")
def events(
    type: str | None = None,
    page: PageParams = Depends(),
    project: Project = Depends(get_project),
    db: Session = Depends(get_db),
):
    where = [Event.project_id == project.id]
    if type:
        where.append(Event.type == type)
    total = db.scalar(select(func.count(Event.id)).where(*where)) or 0
    rows = db.scalars(
        select(Event)
        .where(*where)
        .order_by(Event.id.desc())
        .offset(page.offset)
        .limit(page.page_size)
    ).all()
    return Page(items=rows, total=total, page=page.page, page_size=page.page_size)
