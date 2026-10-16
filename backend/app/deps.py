import uuid

from fastapi import Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import NotFoundError
from app.models import Project


def get_project(pid: uuid.UUID, db: Session = Depends(get_db)) -> Project:
    project = db.get(Project, pid)
    if not project:
        raise NotFoundError("Проект не найден")
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
