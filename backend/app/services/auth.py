from sqlalchemy.orm import Session

from app.errors import ConflictError, UnauthorizedError
from app.models import User
from app.repositories.users import UserRepository
from app.schemas import LoginIn, RegisterIn
from app.security import create_access_token, decode_access_token, hash_password, verify_password


class AuthService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.users = UserRepository(db)

    def register(self, data: RegisterIn) -> tuple[User, str]:
        email = data.email.lower()
        if self.users.get_by_email(email):
            raise ConflictError("Пользователь с таким email уже существует")
        user = self.users.add(
            User(
                email=email,
                full_name=data.full_name.strip(),
                password_hash=hash_password(data.password),
            )
        )
        self.db.commit()
        return user, create_access_token(user.id)

    def login(self, data: LoginIn) -> tuple[User, str]:
        user = self.users.get_by_email(data.email)
        # Одно и то же сообщение для "нет пользователя" и "неверный пароль" - не раскрываем, что есть в системе
        if not user or not verify_password(data.password, user.password_hash):
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
