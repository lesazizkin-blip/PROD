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


def test_invalid_transition_returns_409(client, user_h):
    item_id = client.post("/api/items", json=ITEM, headers=user_h).json()["id"]
    r = client.post(f"/api/items/{item_id}/transitions", json={"action": "approve"}, headers=user_h)
    assert r.status_code in (403, 409)


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
