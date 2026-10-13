import pytest
from pydantic import ValidationError

from app.config import DEFAULT_SECRET_KEY, Settings

GOOD = {"app_env": "production", "secret_key": "x" * 40}


def make(**kw):
    return Settings(_env_file=None, **{**GOOD, **kw})


def test_dev_allows_public_defaults():
    Settings(_env_file=None)  # локальная разработка без настроек - работает


def test_production_rejects_default_secret_key():
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        make(secret_key=DEFAULT_SECRET_KEY)


def test_production_rejects_short_secret_key():
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        make(secret_key="short")


@pytest.mark.parametrize("password", [None, "", "admin12345", "short"])
def test_production_rejects_weak_admin_password(password):
    with pytest.raises(ValidationError, match="ADMIN_PASSWORD"):
        make(admin_email="boss@example.com", admin_password=password)


def test_production_accepts_strong_settings():
    s = make(admin_email="boss@example.com", admin_password="very-strong-pass")
    assert s.app_env == "production"
