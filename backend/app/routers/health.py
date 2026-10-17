from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.schemas import ClientConfigOut, HealthOut

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


@router.get(
    "/config", response_model=ClientConfigOut, summary="Настройки для сайта (ключ подсказок адреса)"
)
def client_config():
    s = get_settings()
    if key := s.maptiler_api_key.strip():
        return {"maps_api_key": key, "maps_provider": "maptiler"}
    if key := s.google_maps_api_key.strip():
        return {"maps_api_key": key, "maps_provider": "google"}
    return {"maps_api_key": None, "maps_provider": None}
