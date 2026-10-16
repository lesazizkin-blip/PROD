import uuid

from fastapi import Depends, Query, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import ForbiddenError, NotFoundError, UnauthorizedError
from app.models import Project, User
from app.services.auth import AuthService

SESSION_COOKIE = "mm_session"


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    user = AuthService(db).user_by_token(request.cookies.get(SESSION_COOKIE))
    if not user:
        raise UnauthorizedError("Войдите, чтобы продолжить")
    return user


def get_project(
    pid: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Project:
    """Проект виден только его участникам. Чужой проект отвечает 404, как несуществующий:
    по ответу нельзя узнать, что такой проект есть."""
    project = db.get(Project, pid)
    if not project or AuthService(db).role(project.id, user.id) is None:
        raise NotFoundError("Проект не найден")
    return project


def get_owned_project(
    project: Project = Depends(get_project),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Project:
    """Удалить проект и приглашать людей может только владелец."""
    if AuthService(db).role(project.id, user.id) != "owner":
        raise ForbiddenError("Это может сделать только владелец проекта")
    return project


class PageParams:
    def __init__(
        self,
        page: int = Query(default=1, ge=1),
        page_size: int = Query(default=50, ge=1, le=200),
    ) -> None:
        self.page = page
        self.page_size = page_size

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size
