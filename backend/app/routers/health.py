from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import HealthOut

router = APIRouter(tags=["service"])


@router.get("/health", response_model=HealthOut, summary="Проверка живости (с запросом к БД)")
def health(db: Session = Depends(get_db)) -> dict:
    db.execute(text("SELECT 1"))  # БД недоступна -> 500: проверка (healthcheck) это увидит
    return {"status": "ok"}
