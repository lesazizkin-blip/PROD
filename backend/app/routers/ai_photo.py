"""Фото-помощник: опись коробки и раскладка комнаты по фото (модель через LLM-прокси Spirit).

Ничего не пишет в проект: возвращает черновик, который пользователь правит и сохраняет обычными
ручками (POST .../items/bulk, POST .../boxes). Лимиты общие с AI-планом (ai_budget)."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.deps import get_current_user, get_project
from app.logging_setup import audit
from app.models import Project, User
from app.schemas import PhotoInventory, PhotoRequest, RoomPhotoRequest, RoomPlan
from app.services.ai_budget import reserve_attempt
from app.services.boxes import BoxService
from app.services.planner import ensure_planner_configured
from app.services.vision import box_inventory, check_image, room_plan

router = APIRouter(prefix="/projects/{pid}", tags=["ai-photo"])


@router.post(
    "/boxes/{number}/photo-inventory",
    response_model=PhotoInventory,
    summary="Опись коробки по фото (черновик модели, в коробку не записывается)",
)
def photo_inventory(
    number: int,
    body: PhotoRequest,
    project: Project = Depends(get_project),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
):
    BoxService(db).get_box(
        project.id, number
    )  # чужая или несуществующая коробка - 404 до вызова модели
    check_image(body.image)  # битое фото не тратит попытку из лимита
    ensure_planner_configured(settings)
    reserve_attempt(db, user.id, settings)
    result = box_inventory(body.image, settings)
    audit("ai.photo_inventory", project_id=project.id, box=number, items=len(result.items))
    return result


@router.post(
    "/room-plan",
    response_model=RoomPlan,
    summary="Раскладка комнаты по коробкам по фото (черновик модели, коробки не создаются)",
)
def photo_room_plan(
    body: RoomPhotoRequest,
    project: Project = Depends(get_project),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
):
    check_image(body.image)
    ensure_planner_configured(settings)
    reserve_attempt(db, user.id, settings)
    result = room_plan(body.image, body.room, settings)
    audit("ai.room_plan", project_id=project.id, boxes=len(result.boxes))
    return result
