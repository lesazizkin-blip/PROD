from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_SECRET_KEY = "dev-secret-change-me-dev-secret-change-me"
DEFAULT_ADMIN_PASSWORD = "admin12345"


class Settings(BaseSettings):
    """Настройки из переменных окружения (или .env). Значения по умолчанию - для локальной разработки."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # production -> при старте проверяются секреты: публичные значения по умолчанию не пускают
    app_env: str = "dev"
    database_url: str = "sqlite:///./app.db"
    secret_key: str = DEFAULT_SECRET_KEY
    access_token_expire_minutes: int = 60
    cors_origins: str = "http://localhost:5173"
    # Если заданы - при старте создаётся администратор (согласующий)
    admin_email: str | None = None
    admin_password: str | None = None
    admin_full_name: str = "Администратор"
    # true -> при старте создаются демо-пользователи и записи (чтобы жюри сразу видело данные)
    seed_demo: bool = False
    # Защита входа от перебора: не больше N неудачных попыток на пару (IP, email) за окно
    login_attempts: int = 10
    login_window_seconds: int = 60
    log_level: str = "INFO"

    @model_validator(mode="after")
    def _forbid_public_secrets_in_production(self) -> "Settings":
        if self.app_env != "production":
            return self
        problems = []
        if self.secret_key == DEFAULT_SECRET_KEY or len(self.secret_key) < 32:
            problems.append("SECRET_KEY: задайте случайную строку не короче 32 символов")
        if self.admin_email and (
            not self.admin_password
            or self.admin_password == DEFAULT_ADMIN_PASSWORD
            or len(self.admin_password) < 8
        ):
            problems.append("ADMIN_PASSWORD: задайте свой пароль (не короче 8 символов)")
        if problems:
            raise ValueError("APP_ENV=production, небезопасные настройки: " + "; ".join(problems))
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
