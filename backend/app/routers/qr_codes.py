from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import ResolveCodeIn, ResolvedBoxOut
from app.services.qr_codes import resolve_code

router = APIRouter(prefix="/boxes", tags=["boxes"])


@router.post(
    "/resolve-code", response_model=ResolvedBoxOut, summary="Открыть коробку по компактному QR"
)
def resolve_box_code(
    body: ResolveCodeIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    box = resolve_code(db, body.code, user.id)
    return ResolvedBoxOut(project_id=box.project_id, box_number=box.number)
