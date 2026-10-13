from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.errors import ConflictError, UnauthorizedError
from app.models import User
from app.repositories.users import UserRepository
from app.schemas import LoginIn, RegisterIn
from app.security import create_access_token, decode_access_token, hash_password, verify_password

# Хеш-пустышка: для неизвестного email считаем тот же хеш, чтобы время ответа не выдавало,
# есть ли такой пользователь
_DUMMY_HASH = hash_password("not-a-real-password")


class AuthService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.users = UserRepository(db)

    def register(self, data: RegisterIn) -> tuple[User, str]:
        email = data.email.lower()
        if self.users.get_by_email(email):
            raise ConflictError("Пользователь с таким email уже существует")
        try:
            user = self.users.add(
                User(
                    email=email,
                    full_name=data.full_name,
                    password_hash=hash_password(data.password),
                )
            )
            self.db.commit()
        except IntegrityError as exc:
            # Два одинаковых email одновременно: проверку выше прошли оба, уникальный индекс - только один
            self.db.rollback()
            raise ConflictError("Пользователь с таким email уже существует") from exc
        return user, create_access_token(user.id)

    def login(self, data: LoginIn) -> tuple[User, str]:
        user = self.users.get_by_email(data.email)
        # Одно и то же сообщение для "нет пользователя" и "неверный пароль" - не раскрываем, что есть в системе
        password_ok = verify_password(data.password, user.password_hash if user else _DUMMY_HASH)
        if not user or not password_ok:
            raise UnauthorizedError("Неверный email или пароль")
        return user, create_access_token(user.id)

    def user_from_token(self, token: str) -> User:
        user = self.users.get(decode_access_token(token))
        if not user:
            raise UnauthorizedError("Пользователь не найден")
        return user

    def ensure_admin(self, email: str, password: str, full_name: str) -> None:
        if self.users.get_by_email(email):
            return
        self.users.add(
            User(
                email=email.lower(),
                full_name=full_name,
                password_hash=hash_password(password),
                role="admin",
            )
        )
        self.db.commit()
