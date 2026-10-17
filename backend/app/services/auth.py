"""Регистрация, вход, сессии, участники проекта и приглашения."""

import logging
import time
import uuid
from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.errors import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    TooManyRequestsError,
    UnauthorizedError,
)
from app.logging_setup import audit
from app.models import AuthSession, Invite, Project, ProjectMember, User
from app.security import hash_password, new_token, token_hash, verify_password


def _aware(dt: datetime) -> datetime:
    """SQLite возвращает время без пояса; в базе оно всегда UTC."""
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


class LoginLimiter:
    """Не больше N неудачных входов на пару (IP, логин) за окно. Память одного процесса: у нас один процесс."""

    # сколько пар (IP, логин) держим, прежде чем выбросить устаревшие: перебор логинов не раздувает память
    SWEEP_AT = 10_000

    def __init__(self) -> None:
        self._fails: dict[tuple[str, str], deque[float]] = defaultdict(deque)

    def check(self, key: tuple[str, str]) -> None:
        s = get_settings()
        q = self._fails.get(key)  # проверка не заводит запись: её заводит только неудачный вход
        if not q:
            return
        while q and q[0] < time.monotonic() - s.login_window_seconds:
            q.popleft()
        if not q:
            del self._fails[key]
        elif len(q) >= s.login_attempts:
            raise TooManyRequestsError("Слишком много попыток входа. Подождите несколько минут.")

    def fail(self, key: tuple[str, str]) -> None:
        now = time.monotonic()
        if len(self._fails) >= self.SWEEP_AT:
            cutoff = now - get_settings().login_window_seconds
            for stale in [k for k, q in self._fails.items() if not q or q[-1] < cutoff]:
                del self._fails[stale]
        self._fails[key].append(now)

    def reset(self, key: tuple[str, str]) -> None:
        self._fails.pop(key, None)


login_limiter = LoginLimiter()
_DUMMY_HASH = hash_password("timing-equalizer")


class AuthService:
    def __init__(self, db: Session) -> None:
        self.db = db

    # --- пользователи и сессии ---
    def register(self, username: str, password: str) -> User:
        if self.db.scalar(select(User.id).where(User.username == username)):
            raise ConflictError("Такой логин уже занят")
        user = User(username=username, password_hash=hash_password(password))
        self.db.add(user)
        try:
            self.db.commit()
        except IntegrityError:  # тот же логин зарегистрировали параллельно
            self.db.rollback()
            raise ConflictError("Такой логин уже занят") from None
        audit("auth.registered", user_id=user.id)
        return user

    def authenticate(self, username: str, password: str, ip: str) -> User:
        key = (ip, username)
        try:
            login_limiter.check(key)
        except TooManyRequestsError:
            audit("auth.login_blocked", level=logging.WARNING, ip=ip)  # перебор пароля
            raise
        user = self.db.scalar(select(User).where(User.username == username))
        # хэш считаем и для несуществующего логина: по времени ответа не узнать, какие логины есть
        if not verify_password(password, user.password_hash if user else _DUMMY_HASH) or not user:
            login_limiter.fail(key)
            audit("auth.login_failed", level=logging.WARNING, ip=ip, known_user=bool(user))
            # одна формулировка для «нет логина» и «не тот пароль»: не подсказываем, какие логины есть
            raise UnauthorizedError("Неверный логин или пароль")
        login_limiter.reset(key)
        audit("auth.login", user_id=user.id, ip=ip)
        return user

    def start_session(self, user: User) -> str:
        token = new_token()
        days = get_settings().session_days
        self.db.add(
            AuthSession(
                token_hash=token_hash(token),
                user_id=user.id,
                expires_at=datetime.now(UTC) + timedelta(days=days),
            )
        )
        self.db.commit()
        return token

    def user_by_token(self, token: str | None) -> User | None:
        if not token:
            return None
        session = self.db.get(AuthSession, token_hash(token))
        if not session or _aware(session.expires_at) < datetime.now(UTC):
            return None
        return self.db.get(User, session.user_id)

    def end_session(self, token: str | None) -> None:
        if token and (session := self.db.get(AuthSession, token_hash(token))):
            audit("auth.logout", user_id=session.user_id)
            self.db.delete(session)
            self.db.commit()

    def change_password(self, user: User, current: str, new: str) -> None:
        if user.username == get_settings().demo_username:
            # демо-аккаунт общий для всего жюри: один проверяющий не должен закрыть вход остальным
            raise ForbiddenError("В демо-аккаунте пароль не меняется")
        if not verify_password(current, user.password_hash):
            raise UnauthorizedError("Текущий пароль указан неверно")
        user.password_hash = hash_password(new)
        # все прежние входы (в том числе на потерянном телефоне) закрываются
        self.db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
        self.db.commit()
        audit("auth.password_changed", user_id=user.id)

    # --- участники ---
    def role(self, project_id: uuid.UUID, user_id: int) -> str | None:
        return self.db.scalar(
            select(ProjectMember.role).where(
                ProjectMember.project_id == project_id, ProjectMember.user_id == user_id
            )
        )

    def add_member(self, project_id: uuid.UUID, user_id: int, role: str) -> None:
        if self.role(project_id, user_id) is None:
            self.db.add(ProjectMember(project_id=project_id, user_id=user_id, role=role))

    def members(self, project_id: uuid.UUID) -> list[tuple[User, str]]:
        rows = self.db.execute(
            select(User, ProjectMember.role)
            .join(ProjectMember, ProjectMember.user_id == User.id)
            .where(ProjectMember.project_id == project_id)
            .order_by(ProjectMember.role.desc(), User.username)  # владелец первым
        ).all()
        return [(u, r) for u, r in rows]

    def remove_member(self, project_id: uuid.UUID, actor: User, user_id: int) -> None:
        """Владелец убирает участника; участник может выйти сам. Владельца убрать нельзя."""
        actor_role = self.role(project_id, actor.id)
        target_role = self.role(project_id, user_id)
        if target_role is None:
            raise NotFoundError("Участник не найден")
        if actor_role != "owner" and actor.id != user_id:
            raise ForbiddenError("Убрать другого участника может только владелец")
        if target_role == "owner":
            raise ConflictError("Владельца нельзя убрать из проекта")
        self.db.execute(
            delete(ProjectMember).where(
                ProjectMember.project_id == project_id, ProjectMember.user_id == user_id
            )
        )
        if actor.id != user_id:
            # иначе убранный участник вернулся бы по той же ссылке (она живёт 7 дней)
            self.db.execute(delete(Invite).where(Invite.project_id == project_id))
        self.db.commit()
        audit("member.removed", project_id=project_id, user_id=user_id, by=actor.id)

    def revoke_invites(self, project_id: uuid.UUID) -> int:
        result = self.db.execute(delete(Invite).where(Invite.project_id == project_id))
        self.db.commit()
        audit("invite.revoked", project_id=project_id, count=result.rowcount or 0)
        return result.rowcount or 0

    def projects_of(self, user_id: int) -> list[tuple[Project, str]]:
        rows = self.db.execute(
            select(Project, ProjectMember.role)
            .join(ProjectMember, ProjectMember.project_id == Project.id)
            .where(ProjectMember.user_id == user_id)
            .order_by(Project.move_date, Project.created_at)
        ).all()
        return [(p, r) for p, r in rows]

    # --- приглашения ---
    def create_invite(self, project_id: uuid.UUID, user_id: int) -> tuple[str, Invite]:
        token = new_token()
        invite = Invite(
            token_hash=token_hash(token),
            project_id=project_id,
            created_by=user_id,
            expires_at=datetime.now(UTC) + timedelta(days=get_settings().invite_days),
        )
        self.db.add(invite)
        self.db.commit()
        audit("invite.created", project_id=project_id, by=user_id)
        return token, invite

    def invite(self, token: str) -> tuple[Invite, Project]:
        invite = self.db.get(Invite, token_hash(token))
        if not invite or _aware(invite.expires_at) < datetime.now(UTC):
            raise NotFoundError("Приглашение не найдено или истекло")
        return invite, self.db.get(Project, invite.project_id)  # type: ignore[return-value]

    def accept_invite(self, token: str, user: User) -> Project:
        invite, project = self.invite(token)
        self.add_member(project.id, user.id, "member")
        try:
            self.db.commit()
        except (
            IntegrityError
        ):  # тот же человек принял ссылку параллельно (двойной клик, две вкладки)
            self.db.rollback()
        audit("invite.accepted", project_id=project.id, user_id=user.id)
        return project
