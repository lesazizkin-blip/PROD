from datetime import UTC, datetime, timedelta

import pytest

import app.seed as seed
from app.config import get_settings
from app.models import AuthSession, Invite
from app.security import hash_password, token_hash, verify_password
from app.services.auth import login_limiter

NEW = {"name": "Переезд", "move_date": "2026-11-01"}


@pytest.fixture(autouse=True)
def _reset_limiter():
    login_limiter._fails.clear()
    yield
    login_limiter._fails.clear()


# ---------- пароли ----------
def test_password_hash_roundtrip_and_salt():
    h1, h2 = hash_password("секретный-пароль"), hash_password("секретный-пароль")
    assert h1 != h2  # у каждого хэша своя соль
    assert verify_password("секретный-пароль", h1)
    assert not verify_password("другой-пароль", h1)
    assert not verify_password("что-угодно", "мусор")
    assert not verify_password("что-угодно", "md5$1$1$1$00$00")


# ---------- регистрация и вход ----------
def test_register_me_logout(anon_client):
    r = anon_client.post(
        "/api/auth/register", json={"username": " Anna ", "password": "пароль-подлиннее"}
    )
    assert r.status_code == 201 and r.json()["username"] == "anna"  # логин без регистра и пробелов
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie
    assert anon_client.get("/api/auth/me").json()["username"] == "anna"

    assert anon_client.post("/api/auth/logout").status_code == 204
    assert anon_client.get("/api/auth/me").status_code == 401


def test_register_validation_and_duplicates(anon_client):
    bad = [
        {"username": "ab", "password": "пароль-подлиннее"},
        {"username": "anna!", "password": "пароль-подлиннее"},
        {"username": "anna", "password": "коротко"},
    ]
    for body in bad:
        assert anon_client.post("/api/auth/register", json=body).status_code == 422
    body = {"username": "anna", "password": "пароль-подлиннее"}
    assert anon_client.post("/api/auth/register", json=body).status_code == 201
    r = anon_client.post("/api/auth/register", json={**body, "username": "ANNA"})
    assert r.status_code == 409 and r.json()["code"] == "conflict"


def test_login_wrong_password_and_rate_limit(anon_client, monkeypatch):
    anon_client.post(
        "/api/auth/register", json={"username": "anna", "password": "пароль-подлиннее"}
    )
    anon_client.post("/api/auth/logout")
    wrong = {"username": "anna", "password": "неверный-пароль"}
    r = anon_client.post("/api/auth/login", json=wrong)
    assert r.status_code == 401 and r.json()["detail"] == "Неверный логин или пароль"
    unknown = anon_client.post(
        "/api/auth/login", json={"username": "nobody", "password": "неверный-пароль"}
    )
    assert unknown.json()["detail"] == r.json()["detail"]  # не выдаём, какие логины существуют

    monkeypatch.setattr(get_settings(), "login_attempts", 3)
    for _ in range(2):
        anon_client.post("/api/auth/login", json=wrong)
    r = anon_client.post(
        "/api/auth/login", json={"username": "anna", "password": "пароль-подлиннее"}
    )
    assert r.status_code == 429  # даже верный пароль ждёт окончания окна
    assert anon_client.get("/api/auth/me").status_code == 401


def test_expired_session_is_rejected(client, db_session):
    for s in db_session.query(AuthSession).all():
        s.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    db_session.commit()
    r = client.get("/api/auth/me")
    assert r.status_code == 401 and r.json()["code"] == "unauthorized"


def test_session_token_is_stored_hashed(anon_client, db_session):
    anon_client.post(
        "/api/auth/register", json={"username": "anna", "password": "пароль-подлиннее"}
    )
    token = anon_client.cookies.get("mm_session")
    stored = db_session.query(AuthSession).one()
    assert stored.token_hash == token_hash(token) and stored.token_hash != token


# ---------- доступ к проектам ----------
def test_projects_need_login(anon_client):
    assert anon_client.post("/api/projects", json=NEW).status_code == 401
    assert anon_client.get("/api/projects").status_code == 401


def test_other_users_project_looks_missing(make_client):
    anna, boris = make_client("anna"), make_client("boris")
    pid = anna.post("/api/projects", json=NEW).json()["id"]
    for method, path in [
        ("get", ""),
        ("get", "/tasks"),
        ("get", "/boxes"),
        ("post", "/boxes"),
        ("get", "/progress"),
        ("delete", "?confirm=true"),
    ]:
        kwargs = {"json": {"room": "Кухня"}} if method == "post" else {}
        r = getattr(boris, method)(f"/api/projects/{pid}{path}", **kwargs)
        assert r.status_code == 404, (
            method,
            path,
            r.status_code,
        )  # 404, а не 403: проект не «светится»
    assert boris.get("/api/projects").json() == []
    assert [p["role"] for p in anna.get("/api/projects").json()] == ["owner"]


def test_anonymous_qr_link_needs_login(anon_client, make_client):
    anna = make_client("anna")
    pid = anna.post("/api/projects", json=NEW).json()["id"]
    anna.post(f"/api/projects/{pid}/boxes", json={"room": "Кухня"})
    assert anon_client.get(f"/api/projects/{pid}/boxes/1").status_code == 401


# ---------- приглашения ----------
def test_invite_flow(make_client, anon_client):
    anna, boris = make_client("anna"), make_client("boris")
    pid = anna.post(
        "/api/projects", json={"name": "Переезд Анны", "move_date": "2026-11-01"}
    ).json()["id"]
    inv = anna.post(f"/api/projects/{pid}/invites")
    assert inv.status_code == 201
    token = inv.json()["token"]
    assert inv.json()["path"] == f"/invite/{token}"

    info = anon_client.get(f"/api/invites/{token}")  # название проекта видно и без входа
    assert info.status_code == 200 and info.json()["project_name"] == "Переезд Анны"
    assert anon_client.post(f"/api/invites/{token}/accept").status_code == 401

    r = boris.post(f"/api/invites/{token}/accept")
    assert r.status_code == 200 and r.json()["id"] == pid
    assert boris.post(f"/api/invites/{token}/accept").status_code == 200  # повторно - без дублей
    assert [p["role"] for p in boris.get("/api/projects").json()] == ["member"]

    # участник работает с коробками, но не удаляет проект и не приглашает других
    assert boris.post(f"/api/projects/{pid}/boxes", json={"room": "Кухня"}).status_code == 201
    assert boris.delete(f"/api/projects/{pid}?confirm=true").status_code == 403
    assert boris.post(f"/api/projects/{pid}/invites").status_code == 403


def test_bad_or_expired_invite(make_client, db_session):
    anna = make_client("anna")
    pid = anna.post("/api/projects", json=NEW).json()["id"]
    token = anna.post(f"/api/projects/{pid}/invites").json()["token"]
    assert anna.get("/api/invites/не-тот-токен").status_code == 404
    db_session.get(Invite, token_hash(token)).expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db_session.commit()
    assert anna.get(f"/api/invites/{token}").status_code == 404
    assert make_client("boris").post(f"/api/invites/{token}/accept").status_code == 404


# ---------- демо для жюри ----------
def test_demo_login_opens_demo_project(anon_client, db_session, monkeypatch):
    monkeypatch.setattr(seed, "SessionLocal", lambda: db_session)
    seed.run()
    monkeypatch.setattr(get_settings(), "seed_demo", True)
    r = anon_client.post("/api/auth/demo")
    assert r.status_code == 200 and r.json()["username"] == get_settings().demo_username
    mine = anon_client.get("/api/projects").json()
    assert [p["id"] for p in mine] == [str(seed.DEMO_ID)]
    # демо-аккаунт входит и обычным паролем из настроек
    anon_client.post("/api/auth/logout")
    creds = {"username": get_settings().demo_username, "password": get_settings().demo_password}
    assert anon_client.post("/api/auth/login", json=creds).status_code == 200


def test_demo_login_is_off_without_seed(anon_client, monkeypatch):
    monkeypatch.setattr(get_settings(), "seed_demo", False)
    assert anon_client.post("/api/auth/demo").status_code == 404


# ---------- участники, отзыв ссылок, смена пароля ----------
def _project_with_member(make_client):
    anna, boris = make_client("anna"), make_client("boris")
    pid = anna.post("/api/projects", json=NEW).json()["id"]
    token = anna.post(f"/api/projects/{pid}/invites").json()["token"]
    boris.post(f"/api/invites/{token}/accept")
    boris_id = boris.get("/api/auth/me").json()["id"]
    return anna, boris, pid, token, boris_id


def test_members_list_and_owner_removes_member(make_client):
    anna, boris, pid, _, boris_id = _project_with_member(make_client)
    members = anna.get(f"/api/projects/{pid}/members").json()
    assert [(m["username"], m["role"]) for m in members] == [("anna", "owner"), ("boris", "member")]
    assert (
        anna.delete(f"/api/projects/{pid}/members/{boris_id}").status_code == 422
    )  # нужно confirm
    assert anna.delete(f"/api/projects/{pid}/members/{boris_id}?confirm=true").status_code == 204
    assert boris.get(f"/api/projects/{pid}").status_code == 404  # доступ пропал сразу


def test_member_can_leave_but_not_remove_others(make_client):
    anna, boris, pid, token, boris_id = _project_with_member(make_client)
    carl = make_client("carl")
    carl.post(f"/api/invites/{token}/accept")
    carl_id = carl.get("/api/auth/me").json()["id"]
    anna_id = anna.get("/api/auth/me").json()["id"]
    assert boris.delete(f"/api/projects/{pid}/members/{carl_id}?confirm=true").status_code == 403
    r = boris.delete(f"/api/projects/{pid}/members/{anna_id}?confirm=true")
    assert r.status_code == 403  # участник не убирает других, владельца тем более
    assert boris.delete(f"/api/projects/{pid}/members/{boris_id}?confirm=true").status_code == 204
    assert anna.delete(f"/api/projects/{pid}/members/999?confirm=true").status_code == 404


def test_revoke_invites(make_client):
    anna, boris, pid, token, _ = _project_with_member(make_client)
    assert boris.delete(f"/api/projects/{pid}/invites").status_code == 403
    r = anna.delete(f"/api/projects/{pid}/invites")
    assert r.status_code == 200 and r.json() == {"revoked": 1}
    assert make_client("carl").post(f"/api/invites/{token}/accept").status_code == 404


def test_change_password_closes_other_sessions(make_client):
    phone, laptop = make_client(), make_client()
    body = {"username": "anna", "password": "старый-пароль"}
    phone.post("/api/auth/register", json=body)
    laptop.post("/api/auth/login", json=body)
    bad = phone.post(
        "/api/auth/password", json={"current_password": "не-тот", "new_password": "новый-пароль"}
    )
    assert bad.status_code == 401
    r = phone.post(
        "/api/auth/password",
        json={"current_password": "старый-пароль", "new_password": "новый-пароль"},
    )
    assert r.status_code == 200
    assert phone.get("/api/auth/me").status_code == 200  # здесь остались в системе
    assert laptop.get("/api/auth/me").status_code == 401  # другой вход закрыт
    assert laptop.post("/api/auth/login", json=body).status_code == 401
    assert (
        laptop.post("/api/auth/login", json={**body, "password": "новый-пароль"}).status_code == 200
    )


def test_demo_account_is_protected(anon_client, db_session, monkeypatch):
    monkeypatch.setattr(seed, "SessionLocal", lambda: db_session)
    seed.run()
    monkeypatch.setattr(get_settings(), "seed_demo", True)
    anon_client.post("/api/auth/demo")
    pwd = {"current_password": get_settings().demo_password, "new_password": "чужой-пароль-1"}
    assert anon_client.post("/api/auth/password", json=pwd).status_code == 403
    r = anon_client.delete(f"/api/projects/{seed.DEMO_ID}?confirm=true")
    assert r.status_code == 403 and r.json()["code"] == "forbidden"
    assert anon_client.get(f"/api/projects/{seed.DEMO_ID}").status_code == 200


def test_removed_member_cannot_come_back_with_old_link(make_client):
    owner, helper = make_client(), make_client()
    owner.post("/api/auth/register", json={"username": "own_a", "password": "пароль-123456"})
    helper.post("/api/auth/register", json={"username": "help_a", "password": "пароль-123456"})
    pid = owner.post("/api/projects", json={"name": "Семья", "move_date": "2026-11-16"}).json()[
        "id"
    ]
    token = owner.post(f"/api/projects/{pid}/invites").json()["token"]
    assert helper.post(f"/api/invites/{token}/accept").status_code == 200
    helper_id = helper.get("/api/auth/me").json()["id"]
    assert owner.delete(f"/api/projects/{pid}/members/{helper_id}?confirm=true").status_code == 204
    assert helper.post(f"/api/invites/{token}/accept").status_code == 404
    assert helper.get(f"/api/projects/{pid}").status_code == 404
