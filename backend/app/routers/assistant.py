from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_project
from app.models import Project
from app.schemas import ChecklistApplied, ChecklistIn, ChecklistOut
from app.services.assistant import AssistantService

router = APIRouter(prefix="/projects/{pid}/assistant", tags=["assistant"])


@router.post(
    "/checklist",
    response_model=ChecklistOut,
    summary="Что добавить в план для детей, питомцев, другого города",
)
def suggest_checklist(
    body: ChecklistIn, project: Project = Depends(get_project), db: Session = Depends(get_db)
):
    return AssistantService(db).suggest(project, body)


@router.post(
    "/checklist/apply",
    response_model=ChecklistApplied,
    summary="Добавить предложенное (повторный вызов не дублирует)",
)
def apply_checklist(
    body: ChecklistIn, project: Project = Depends(get_project), db: Session = Depends(get_db)
):
    return AssistantService(db).apply(project, body)
