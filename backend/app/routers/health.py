from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import HealthOut

router = APIRouter(tags=["service"])

VERSION = "1.0.0"


@router.get(
    "/health", response_model=HealthOut, summary="Проверка работоспособности (с запросом к БД)"
)
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        return JSONResponse(
            status_code=503, content={"status": "error", "db": "down", "version": VERSION}
        )
    return {"status": "ok", "db": "ok", "version": VERSION}
