from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import TaskTemplate, Tip
from app.schemas import TaskTemplateOut, TipOut, TipTopic

router = APIRouter(tags=["reference"])


@router.get("/task-templates", response_model=list[TaskTemplateOut], summary="Шаблоны задач")
def task_templates(db: Session = Depends(get_db)):
    return db.scalars(select(TaskTemplate).order_by(TaskTemplate.id)).all()


@router.get("/tips", response_model=list[TipOut], summary="Памятки")
def tips(topic: TipTopic | None = None, db: Session = Depends(get_db)):
    q = select(Tip).order_by(Tip.id)
    if topic:
        q = q.where(Tip.topic == topic.value)
    return db.scalars(q).all()
