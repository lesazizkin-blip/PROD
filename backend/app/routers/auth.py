from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.errors import UnauthorizedError
from app.models import User
from app.ratelimit import login_limiter
from app.schemas import LoginIn, RegisterIn, TokenOut, UserOut
from app.services.auth import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenOut, status_code=201, summary="Регистрация")
def register(body: RegisterIn, db: Session = Depends(get_db)):
    user, token = AuthService(db).register(body)
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenOut, summary="Вход")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    key = f"{request.client.host if request.client else '-'}:{body.email.lower()}"
    login_limiter.check(key)
    try:
        user, token = AuthService(db).login(body)
    except UnauthorizedError:
        login_limiter.fail(key)
        raise
    login_limiter.clear(key)
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut, summary="Текущий пользователь")
def me(user: User = Depends(get_current_user)):
    return user
