"""Интеграционные тесты: HTTP + БД + авторизация."""

from fastapi.testclient import TestClient

from app.db import get_db
from app.main import app

ITEM = {"title": "Кэшбэк 10% на кофе", "description": "Описание", "amount": 50000}


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_register_login_me(client):
    r = client.post(
        "/api/auth/register",
        json={
            "email": "New@Example.com",
            "full_name": "Новый Пользователь",
            "password": "password123",
        },
    )
    assert r.status_code == 201
    assert r.json()["user"]["email"] == "new@example.com"  # email нормализуется
    assert r.json()["user"]["role"] == "user"
    login = client.post(
        "/api/auth/login", json={"email": "new@example.com", "password": "password123"}
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert client.get("/api/auth/me", headers=headers).json()["full_name"] == "Новый Пользователь"


def test_register_duplicate_email_is_conflict(client, user):
    r = client.post(
        "/api/auth/register",
        json={"email": user.email, "full_name": "Дубль Дублёв", "password": "password123"},
    )
    assert r.status_code == 409


def test_login_wrong_password_is_401(client, user):
    r = client.post("/api/auth/login", json={"email": user.email, "password": "wrong-password"})
    assert r.status_code == 401
    assert "request_id" in r.json()


def test_items_require_auth(client):
    assert client.get("/api/items").status_code == 401
    assert client.get("/api/items", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_full_review_flow_over_http(client, user_h, admin_h):
    created = client.post("/api/items", json=ITEM, headers=user_h)
    assert created.status_code == 201
    item_id = created.json()["id"]
    assert created.json()["status"] == "draft"

    r = client.post(f"/api/items/{item_id}/transitions", json={"action": "submit"}, headers=user_h)
    assert r.json()["status"] == "in_review"

    r = client.post(
        f"/api/items/{item_id}/transitions",
        json={"action": "request_changes", "comment": "Добавьте условия"},
        headers=admin_h,
    )
    assert r.json()["status"] == "changes_requested"

    events = client.get(f"/api/items/{item_id}/events", headers=user_h).json()
    assert [e["to_status"] for e in events] == ["draft", "in_review", "changes_requested"]
    assert events[-1]["comment"] == "Добавьте условия"


def test_validation_error_has_field_details(client, user_h):
    r = client.post("/api/items", json={"title": "ab", "amount": -5}, headers=user_h)
    assert r.status_code == 422
    fields = {e["field"] for e in r.json()["errors"]}
    assert {"title", "amount"} <= fields


def test_invalid_transition_returns_409(client, user_h, admin_h):
    item_id = client.post("/api/items", json=ITEM, headers=user_h).json()["id"]
    # одобрить можно только запись «на согласовании»; черновик - нельзя
    r = client.post(
        f"/api/items/{item_id}/transitions", json={"action": "approve"}, headers=admin_h
    )
    assert r.status_code == 409
    assert r.json()["code"] == "conflict"


def test_user_cannot_approve_returns_403(client, user_h):
    item_id = client.post("/api/items", json=ITEM, headers=user_h).json()["id"]
    client.post(f"/api/items/{item_id}/transitions", json={"action": "submit"}, headers=user_h)
    r = client.post(f"/api/items/{item_id}/transitions", json={"action": "approve"}, headers=user_h)
    assert r.status_code == 403


def test_foreign_item_is_404_for_other_user(client, user_h, other_h):
    item_id = client.post("/api/items", json=ITEM, headers=user_h).json()["id"]
    assert client.get(f"/api/items/{item_id}", headers=other_h).status_code == 404


def test_list_visibility_filter_search_and_pagination(client, user_h, other_h, admin_h):
    for i in range(3):
        client.post("/api/items", json={**ITEM, "title": f"Запись номер {i}"}, headers=user_h)
    client.post("/api/items", json={**ITEM, "title": "Чужая запись"}, headers=other_h)

    mine = client.get("/api/items", headers=user_h).json()
    assert mine["total"] == 3
    assert client.get("/api/items", headers=admin_h).json()["total"] == 4  # админ видит всё

    page = client.get("/api/items?limit=2&offset=2", headers=user_h).json()
    assert len(page["items"]) == 1 and page["total"] == 3

    found = client.get("/api/items?q=номер 1", headers=user_h).json()
    assert found["total"] == 1

    assert client.get("/api/items?status=approved", headers=user_h).json()["total"] == 0
    assert client.get("/api/items?status=bogus", headers=user_h).status_code == 422


def test_update_only_by_owner_in_draft(client, user_h, other_h):
    item_id = client.post("/api/items", json=ITEM, headers=user_h).json()["id"]
    ok = client.patch(f"/api/items/{item_id}", json={"title": "Новое название"}, headers=user_h)
    assert ok.status_code == 200 and ok.json()["title"] == "Новое название"
    assert (
        client.patch(f"/api/items/{item_id}", json={"title": "Взлом"}, headers=other_h).status_code
        == 404
    )


def test_response_carries_request_id_header(client):
    r = client.get("/api/health", headers={"x-request-id": "abc123"})
    assert r.headers["x-request-id"] == "abc123"


def test_unhandled_error_returns_500_with_request_id(db_session, monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr("app.routers.health.text", boom)
    app.dependency_overrides[get_db] = lambda: db_session
    # По умолчанию TestClient пробрасывает исключения - нам нужен реальный ответ сервера
    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.get("/api/health")
    app.dependency_overrides.clear()
    assert r.status_code == 500
    assert r.json()["code"] == "internal_error" and r.json()["request_id"]


def test_stats_counts_by_status_and_visibility(client, user_h, other_h, admin_h):
    a = client.post("/api/items", json=ITEM, headers=user_h).json()["id"]
    b = client.post("/api/items", json=ITEM, headers=user_h).json()["id"]
    client.post("/api/items", json=ITEM, headers=other_h)
    for item_id in (a, b):
        client.post(f"/api/items/{item_id}/transitions", json={"action": "submit"}, headers=user_h)
    client.post(f"/api/items/{a}/transitions", json={"action": "approve"}, headers=admin_h)

    mine = client.get("/api/stats", headers=user_h).json()
    assert (
        mine["total"] == 2
        and mine["by_status"]["in_review"] == 1
        and mine["by_status"]["approved"] == 1
    )
    assert mine["approval_rate"] == 1.0 and mine["pending"] == 1

    everything = client.get("/api/stats", headers=admin_h).json()
    assert everything["total"] == 3 and everything["by_status"]["draft"] == 1


def test_stats_requires_auth(client):
    assert client.get("/api/stats").status_code == 401


def test_reject_without_comment_returns_422(client, user_h, admin_h):
    item_id = client.post("/api/items", json=ITEM, headers=user_h).json()["id"]
    client.post(f"/api/items/{item_id}/transitions", json={"action": "submit"}, headers=user_h)
    r = client.post(f"/api/items/{item_id}/transitions", json={"action": "reject"}, headers=admin_h)
    assert r.status_code == 422
    assert r.json()["code"] == "validation_failed"


def test_unknown_item_returns_404(client, user_h):
    assert client.get("/api/items/99999", headers=user_h).status_code == 404
    assert client.get("/api/items/99999/events", headers=user_h).status_code == 404
    r = client.post("/api/items/99999/transitions", json={"action": "submit"}, headers=user_h)
    assert r.status_code == 404


def test_patch_in_review_returns_409(client, user_h):
    item_id = client.post("/api/items", json=ITEM, headers=user_h).json()["id"]
    client.post(f"/api/items/{item_id}/transitions", json={"action": "submit"}, headers=user_h)
    r = client.patch(f"/api/items/{item_id}", json={"title": "Новое название"}, headers=user_h)
    assert r.status_code == 409


def test_patch_is_recorded_in_history(client, user_h):
    item_id = client.post("/api/items", json=ITEM, headers=user_h).json()["id"]
    client.patch(f"/api/items/{item_id}", json={"description": "Уточнил"}, headers=user_h)
    events = client.get(f"/api/items/{item_id}/events", headers=user_h).json()
    assert [e["action"] for e in events] == ["create", "update"]


def test_admin_cannot_approve_own_item(client, admin_h):
    item_id = client.post("/api/items", json=ITEM, headers=admin_h).json()["id"]
    client.post(f"/api/items/{item_id}/transitions", json={"action": "submit"}, headers=admin_h)
    r = client.post(
        f"/api/items/{item_id}/transitions", json={"action": "approve"}, headers=admin_h
    )
    assert r.status_code == 403


def test_whitespace_only_values_are_rejected(client, user_h):
    r = client.post("/api/items", json={**ITEM, "title": "     "}, headers=user_h)
    assert r.status_code == 422
    r = client.post(
        "/api/auth/register",
        json={"email": "ws@example.com", "full_name": "    ", "password": "password123"},
    )
    assert r.status_code == 422


def test_search_treats_percent_and_underscore_literally(client, user_h):
    client.post("/api/items", json={**ITEM, "title": "Скидка 100% на всё"}, headers=user_h)
    client.post("/api/items", json={**ITEM, "title": "Обычная запись"}, headers=user_h)
    client.post("/api/items", json={**ITEM, "title": "Кэшбэк_10"}, headers=user_h)
    assert client.get("/api/items?q=%25", headers=user_h).json()["total"] == 1  # только «100%»
    assert client.get("/api/items?q=_", headers=user_h).json()["total"] == 1  # только «Кэшбэк_10»


def test_register_race_returns_409_not_500(client, user, monkeypatch):
    """Проверка «такого email нет» прошла у обоих запросов - второй упирается в уникальный индекс."""
    from app.repositories.users import UserRepository

    monkeypatch.setattr(UserRepository, "get_by_email", lambda self, email: None)
    r = client.post(
        "/api/auth/register",
        json={"email": user.email, "full_name": "Дубль Дублёв", "password": "password123"},
    )
    assert r.status_code == 409


def test_login_is_rate_limited_after_failures(client, user):
    for _ in range(10):
        r = client.post("/api/auth/login", json={"email": user.email, "password": "wrong-password"})
        assert r.status_code == 401
    r = client.post("/api/auth/login", json={"email": user.email, "password": "wrong-password"})
    assert r.status_code == 429
    # даже верный пароль в этот момент не пускает - пока не пройдёт окно
    r = client.post("/api/auth/login", json={"email": user.email, "password": "password123"})
    assert r.status_code == 429


def test_successful_login_resets_failures(client, user):
    for _ in range(5):
        client.post("/api/auth/login", json={"email": user.email, "password": "wrong-password"})
    assert (
        client.post(
            "/api/auth/login", json={"email": user.email, "password": "password123"}
        ).status_code
        == 200
    )
    for _ in range(9):
        assert (
            client.post("/api/auth/login", json={"email": user.email, "password": "x"}).status_code
            == 401
        )


def test_expired_foreign_and_expless_tokens_are_rejected(client, user):
    from datetime import UTC, datetime, timedelta

    import jwt as pyjwt

    from app.config import get_settings

    key = get_settings().secret_key
    now = datetime.now(UTC)
    bad = {
        "expired": pyjwt.encode(
            {"sub": str(user.id), "exp": now - timedelta(minutes=1)}, key, algorithm="HS256"
        ),
        "wrong key": pyjwt.encode(
            {"sub": str(user.id), "exp": now + timedelta(hours=1)}, "x" * 40, algorithm="HS256"
        ),
        "no exp": pyjwt.encode({"sub": str(user.id)}, key, algorithm="HS256"),
        "unknown user": pyjwt.encode(
            {"sub": "999999", "exp": now + timedelta(hours=1)}, key, algorithm="HS256"
        ),
    }
    for name, token in bad.items():
        r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 401, name


def test_500_keeps_cors_headers_and_request_id(db_session, monkeypatch):
    """Без этого браузер показывает CORS-ошибку вместо 500, а request_id теряется из заголовков."""

    def boom(*args, **kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr("app.routers.health.text", boom)
    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.get("/api/health", headers={"Origin": "http://localhost:5173"})
    app.dependency_overrides.clear()
    assert r.status_code == 500
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert r.headers["x-request-id"] == r.json()["request_id"]


def test_lifespan_creates_admin_from_env(db_session, monkeypatch):
    import app.main as main

    monkeypatch.setattr(main.settings, "admin_email", "boss@example.com")
    monkeypatch.setattr(main.settings, "admin_password", "very-strong-pass")
    monkeypatch.setattr(main, "SessionLocal", lambda: db_session)
    with TestClient(app):
        pass
    from app.models import User

    boss = db_session.query(User).filter_by(email="boss@example.com").one()
    assert boss.role == "admin"


def test_openapi_describes_stats_and_health(client):
    schemas = client.get("/api/openapi.json").json()["components"]["schemas"]
    assert "StatsOut" in schemas and "HealthOut" in schemas
