from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import StatsOut
from app.services.stats import StatsService

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get(
    "",
    response_model=StatsOut,
    summary="Сводка: сколько записей в каждом статусе, доля согласованных",
)
def stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    return StatsService(db).summary(user)
