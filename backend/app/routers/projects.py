from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import DEMO_PROJECT_ID
from app.db import get_db
from app.deps import PageParams, get_current_user, get_owned_project, get_project
from app.errors import ForbiddenError
from app.models import Event, Project, User
from app.routers.common import confirm_param
from app.schemas import (
    AppliedTemplates,
    EventOut,
    InviteOut,
    MemberOut,
    Page,
    ProjectBrief,
    ProjectCreate,
    ProjectOut,
    ProjectUpdate,
    RevokedInvites,
    Stage,
    TaskCreate,
    TaskOut,
    TaskUpdate,
)
from app.services.auth import AuthService
from app.services.projects import ProjectService
from app.services.tasks import TaskService

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post(
    "", response_model=ProjectOut, status_code=201, summary="Создать проект (с шаблонами задач)"
)
def create_project(
    body: ProjectCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return ProjectService(db).create(body, owner_id=user.id)


@router.get("", response_model=list[ProjectBrief], summary="Мои проекты (владелец и участник)")
def my_projects(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [
        ProjectBrief(id=p.id, name=p.name, move_date=p.move_date, role=role)
        for p, role in AuthService(db).projects_of(user.id)
    ]


@router.post(
    "/{pid}/invites",
    response_model=InviteOut,
    status_code=201,
    summary="Ссылка-приглашение в проект (только владелец)",
)
def create_invite(
    project: Project = Depends(get_owned_project),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    token, invite = AuthService(db).create_invite(project.id, user.id)
    return InviteOut(token=token, path=f"/invite/{token}", expires_at=invite.expires_at)


@router.delete(
    "/{pid}/invites",
    response_model=RevokedInvites,
    summary="Отозвать все ссылки-приглашения (только владелец)",
)
def revoke_invites(project: Project = Depends(get_owned_project), db: Session = Depends(get_db)):
    return RevokedInvites(revoked=AuthService(db).revoke_invites(project.id))


@router.get("/{pid}/members", response_model=list[MemberOut], summary="Участники проекта")
def members(project: Project = Depends(get_project), db: Session = Depends(get_db)):
    return [
        MemberOut(user_id=u.id, username=u.username, role=role)
        for u, role in AuthService(db).members(project.id)
    ]


@router.delete(
    "/{pid}/members/{user_id}",
    status_code=204,
    summary="Убрать участника (владелец) или выйти из проекта (сам участник), confirm=true",
)
def remove_member(
    user_id: int,
    project: Project = Depends(get_project),
    user: User = Depends(get_current_user),
    _=Depends(confirm_param),
    db: Session = Depends(get_db),
):
    AuthService(db).remove_member(project.id, user, user_id)
    return Response(status_code=204)


@router.get("/{pid}", response_model=ProjectOut, summary="Получить проект")
def get_project_(project: Project = Depends(get_project)):
    return project


@router.patch("/{pid}", response_model=ProjectOut, summary="Изменить проект")
def update_project(
    body: ProjectUpdate,
    project: Project = Depends(get_project),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if "qr_mode" in body.model_fields_set and AuthService(db).role(project.id, user.id) != "owner":
        raise ForbiddenError("Режим QR может изменить только владелец проекта")
    return ProjectService(db).update(project, body)


@router.delete(
    "/{pid}", status_code=204, summary="Удалить проект со всем содержимым (confirm=true)"
)
def delete_project(
    project: Project = Depends(get_owned_project),
    _=Depends(confirm_param),
    db: Session = Depends(get_db),
):
    if project.id == DEMO_PROJECT_ID:
        # демо-проект общий для жюри: удаление оставило бы следующих проверяющих без данных
        raise ForbiddenError("Демо-проект удалить нельзя")
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
