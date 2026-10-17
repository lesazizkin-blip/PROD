import base64
import secrets

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.errors import ConflictError, NotFoundError
from app.models import Box, BoxQrCode, ProjectMember


def new_code() -> str:
    return "MM1:" + base64.b32encode(secrets.token_bytes(10)).decode("ascii")


def assign_code(db: Session, box: Box) -> None:
    for _ in range(5):
        code = BoxQrCode(code=new_code(), box_id=box.id)
        try:
            with db.begin_nested():
                db.add(code)
                db.flush()
        except IntegrityError:
            continue
        box.qr_code = code
        return
    db.rollback()
    raise ConflictError("Не удалось выдать код коробки, повторите запрос")


def resolve_code(db: Session, code: str, user_id: int) -> Box:
    box = db.scalar(
        select(Box)
        .join(BoxQrCode, BoxQrCode.box_id == Box.id)
        .join(ProjectMember, ProjectMember.project_id == Box.project_id)
        .where(BoxQrCode.code == code, ProjectMember.user_id == user_id)
    )
    if box is None:
        raise NotFoundError("Коробка не найдена или недоступна")
    return box
