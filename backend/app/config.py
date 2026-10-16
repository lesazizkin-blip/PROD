from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Настройки из переменных окружения (или .env). Значения по умолчанию - для локальной разработки."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "dev"
    database_url: str = "sqlite:///./app.db"
    # Мобильному клиенту CORS не нужен; оставлено для запросов из Swagger/браузера
    cors_origins: str = "http://localhost:8000"
    # true -> при старте создаётся демо-проект (чтобы жюри сразу видело данные)
    seed_demo: bool = False
    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()
