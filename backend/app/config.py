import uuid
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# Демо-проект для жюри (python -m app.seed): фиксированный id, общий для всех, кто входит в демо
DEMO_PROJECT_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


class Settings(BaseSettings):
    """Настройки из переменных окружения (или .env). Значения по умолчанию - для локальной разработки."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "dev"
    database_url: str = "sqlite:///./app.db"
    # сайт и API на одном адресе, поэтому CORS нужен только для Swagger/разработки
    cors_origins: str = "http://localhost:8000"
    # true -> при старте создаётся демо-аккаунт с демо-проектом, и работает вход «Демо» для жюри
    seed_demo: bool = False
    # логин и пароль демо-аккаунта (данные демо-проекта общие для всех, кто входит в демо)
    demo_username: str = "demo"
    demo_password: str = "demo-pereezd"
    # сколько живёт вход и приглашение
    session_days: int = 30
    invite_days: int = 7
    # защита входа от перебора: не больше N неудачных попыток на пару (IP, логин) за окно
    login_attempts: int = 10
    login_window_seconds: int = 300
    # папка с собранным сайтом (frontend/dist): тогда бэкенд сам отдаёт сайт на том же порту
    static_dir: str | None = None
    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()
