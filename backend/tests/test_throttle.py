"""Защита от флуда: лимит запросов к /api с одного IP и лимит регистраций."""

import pytest

from app import main
from app.throttle import WindowLimiter


def test_window_limiter_counts_per_ip_and_resets_with_new_window():
    lim = WindowLimiter(limit=2, window_seconds=60)
    assert lim.hit("1.1.1.1", now=0) and lim.hit("1.1.1.1", now=1)
    assert not lim.hit("1.1.1.1", now=2)  # третий запрос в окне
    assert lim.hit("2.2.2.2", now=3)  # у другого адреса свой счётчик
    assert lim.hit("1.1.1.1", now=61)  # новое окно
    assert lim.retry_after(now=61) == 59


@pytest.fixture()
def limits(monkeypatch):
    def set_limits(api: int, register: int):
        monkeypatch.setattr(main, "api_limiter", WindowLimiter(api, 60))
        monkeypatch.setattr(main, "register_limiter", WindowLimiter(register, 3600))

    return set_limits


def test_api_flood_from_one_ip_gets_429_other_ip_and_health_still_work(anon_client, limits):
    limits(api=3, register=0)
    for _ in range(3):
        assert anon_client.get("/api/tips").status_code == 200
    r = anon_client.get("/api/tips")
    assert r.status_code == 429
    assert r.json()["code"] == "too_many_requests"
    assert int(r.headers["retry-after"]) >= 1
    # проверка здоровья не ограничивается (по ней Docker и сторож решают, жив ли сервис)
    assert anon_client.get("/api/health").status_code == 200
    other = anon_client.get("/api/tips", headers={"x-forwarded-for": "203.0.113.7"})
    assert other.status_code == 200


def test_mass_registration_from_one_ip_is_limited(anon_client, limits):
    limits(api=0, register=2)
    for i in range(2):
        r = anon_client.post(
            "/api/auth/register", json={"username": f"bot{i}", "password": "пароль-123456"}
        )
        assert r.status_code == 201
    r = anon_client.post(
        "/api/auth/register", json={"username": "bot9", "password": "пароль-123456"}
    )
    assert r.status_code == 429
    # вход и остальной API лимит регистраций не трогает
    assert anon_client.get("/api/tips").status_code == 200
