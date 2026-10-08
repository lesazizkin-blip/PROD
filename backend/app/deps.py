from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import UnauthorizedError
from app.models import User
from app.services.auth import AuthService

bearer = HTTPBearer(auto_error=False, description="JWT из /api/auth/login")


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)
) -> User:
    if creds is None:
        raise UnauthorizedError("Требуется авторизация")
    return AuthService(db).user_from_token(creds.credentials)
