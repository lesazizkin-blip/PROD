from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Настройки из переменных окружения (или .env). Значения по умолчанию - для локальной разработки."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./app.db"
    secret_key: str = "dev-secret-change-me-dev-secret-change-me"
    access_token_expire_minutes: int = 60
    cors_origins: str = "http://localhost:5173"
    # Если заданы - при старте создаётся администратор (согласующий)
    admin_email: str | None = None
    admin_password: str | None = None
    admin_full_name: str = "Администратор"
    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()
