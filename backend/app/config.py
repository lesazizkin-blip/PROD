import uuid
from functools import lru_cache

from pydantic import Field, SecretStr, field_validator
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
    # защита от флуда (backend/app/throttle.py): запросов к /api с одного IP в минуту и регистраций с одного
    # IP в час; 0 выключает. Щедро: жюри и команда на площадке могут выходить в сеть с одного адреса
    api_requests_per_minute: int = Field(default=1200, ge=0)
    registrations_per_hour: int = Field(default=30, ge=0)
    # папка с собранным сайтом (frontend/dist): тогда бэкенд сам отдаёт сайт на том же порту
    static_dir: str | None = None
    log_level: str = "INFO"
    # Совместимый с Chat Completions endpoint; ключ никогда не отправляется на сайт.
    ai_api_key: SecretStr = SecretStr("")
    ai_base_url: str = ""
    ai_model: str = ""
    # отдельная модель для фото (опись коробки, раскладка комнаты) через тот же прокси и ключ;
    # должна понимать изображения. Пусто -> фото идут в AI_MODEL
    ai_vision_model: str = ""
    # свой ключ для второй модели (другой аккаунт Spirit); пусто -> общий AI_API_KEY. На сайт не отдаётся
    ai_vision_api_key: SecretStr = SecretStr("")
    ai_timeout_seconds: float = Field(default=45, gt=0, le=60)
    ai_requests_per_hour: int = Field(default=10, ge=1, le=1000)
    ai_global_requests_per_day: int = Field(default=50, ge=0, le=10_000)

    @field_validator("ai_base_url")
    @classmethod
    def validate_ai_url(cls, value: str) -> str:
        if value and (
            not value.startswith("https://") or "@" in value or "?" in value or "#" in value
        ):
            raise ValueError(
                "AI_BASE_URL должен быть HTTPS URL без учётных данных, query и fragment"
            )
        return value.rstrip("/")

    # ключ Google Maps JavaScript API для подсказок адреса; пусто -> подсказки на сайте выключены.
    # Это ключ для браузера (он виден на странице), его ограничивают по адресу сайта в Google Cloud
    google_maps_api_key: str = ""
    # ключ MapTiler (Geocoding и Static Maps API) - то же, но без привязки карты оплаты; если задан, важнее Google
    maptiler_api_key: str = ""
    # аппендер логов в Sage: полный адрес Logs Collector с группой
    # (https://<хост коллектора>/api/hack-led-20/multiline/) и Spirit API ключ. Пусто -> логи только в stdout
    sage_logs_url: str = ""
    sage_api_key: str = ""
    # коллектор трейсов Sage (OTLP gRPC, например https://<хост>:4319); ключ тот же SAGE_API_KEY.
    # Пусто -> трейсы не отправляются, но trace_id/span_id всё равно пишутся в логи
    sage_traces_endpoint: str = ""
    # метрики в Sage по Remote Write (Frost), ключ тот же SAGE_API_KEY; пусто -> не отправляются
    # (https://sage.spirit.t-education.com/frost_remote_write/api/v1/write)
    sage_metrics_url: str = ""
    sage_metrics_interval: float = Field(default=30.0, ge=5)


@lru_cache
def get_settings() -> Settings:
    return Settings()
