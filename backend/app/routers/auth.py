from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import SESSION_COOKIE, get_current_user
from app.errors import NotFoundError
from app.models import User
from app.schemas import Credentials, InviteInfo, ProjectOut, UserOut
from app.services.auth import AuthService

router = APIRouter(tags=["auth"])


def _set_session(response: Response, token: str) -> None:
    s = get_settings()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=s.session_days * 24 * 3600,
        httponly=True,  # скрипты страницы токен не видят: XSS не украдёт вход
        samesite="lax",  # чужой сайт не отправит POST с нашей cookie (защита от CSRF)
        secure=s.app_env == "production",  # на проде только по HTTPS
        path="/",
    )


def _client_ip(request: Request) -> str:
    # за Caddy адрес клиента приходит в X-Forwarded-For (первый в списке)
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() or (request.client.host if request.client else "-")


@router.post(
    "/auth/register", response_model=UserOut, status_code=201, summary="Регистрация и вход"
)
def register(body: Credentials, response: Response, db: Session = Depends(get_db)):
    service = AuthService(db)
    user = service.register(body.username, body.password)
    _set_session(response, service.start_session(user))
    return user


@router.post("/auth/login", response_model=UserOut, summary="Вход по логину и паролю")
def login(body: Credentials, request: Request, response: Response, db: Session = Depends(get_db)):
    service = AuthService(db)
    user = service.authenticate(body.username, body.password, _client_ip(request))
    _set_session(response, service.start_session(user))
    return user


@router.post("/auth/demo", response_model=UserOut, summary="Вход в демо-аккаунт (для жюри)")
def demo_login(response: Response, db: Session = Depends(get_db)):
    s = get_settings()
    service = AuthService(db)
    user = db.query(User).filter_by(username=s.demo_username).first() if s.seed_demo else None
    if not user:
        raise NotFoundError("Демо-аккаунт выключен")
    _set_session(response, service.start_session(user))
    return user


@router.post("/auth/logout", status_code=204, summary="Выход")
def logout(request: Request, db: Session = Depends(get_db)):
    AuthService(db).end_session(request.cookies.get(SESSION_COOKIE))
    response = Response(status_code=204)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response


@router.get("/auth/me", response_model=UserOut, summary="Кто вошёл")
def me(user: User = Depends(get_current_user)):
    return user


@router.get("/invites/{token}", response_model=InviteInfo, summary="Что за приглашение (без входа)")
def invite_info(token: str, db: Session = Depends(get_db)):
    invite, project = AuthService(db).invite(token)
    return InviteInfo(project_name=project.name, expires_at=invite.expires_at)


@router.post(
    "/invites/{token}/accept", response_model=ProjectOut, summary="Принять приглашение в проект"
)
def accept_invite(
    token: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return AuthService(db).accept_invite(token, user)
