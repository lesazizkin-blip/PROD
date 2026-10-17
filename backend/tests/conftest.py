import os

# TEST_DATABASE_URL=postgresql+psycopg://... прогоняет все тесты на PostgreSQL (так делает CI)
TEST_DB_URL = os.environ.get("TEST_DATABASE_URL") or "sqlite://"
os.environ["DATABASE_URL"] = TEST_DB_URL

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.db import Base, engine, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.reference_data import ensure_reference_data  # noqa: E402


@pytest.fixture()
def db_session():
    """Чистая БД на каждый тест (тот же engine, что видит lifespan приложения) + справочники."""
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    ensure_reference_data(session)
    yield session
    session.close()
    Base.metadata.drop_all(engine)


@pytest.fixture()
def anon_client(db_session):
    """Клиент без входа."""
    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def login_as(client, username: str, password: str = "пароль-для-тестов") -> dict:
    """Регистрирует пользователя (или входит, если он уже есть); cookie сессии остаётся в клиенте."""
    r = client.post("/api/auth/register", json={"username": username, "password": password})
    if r.status_code == 409:
        r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code in (200, 201), r.text
    return r.json()


@pytest.fixture()
def client(anon_client):
    """Клиент, который уже вошёл как пользователь tester (почти все тесты работают от него)."""
    login_as(anon_client, "tester")
    return anon_client


@pytest.fixture()
def make_client(db_session):
    """Фабрика отдельных клиентов: у каждого своя cookie, как у разных людей с разными телефонами."""
    clients = []

    def factory(username: str | None = None):
        c = TestClient(app)
        c.__enter__()
        clients.append(c)
        if username:
            login_as(c, username)
        return c

    app.dependency_overrides[get_db] = lambda: db_session
    yield factory
    for c in clients:
        c.__exit__(None, None, None)
    app.dependency_overrides.clear()


@pytest.fixture()
def project(client):
    r = client.post("/api/projects", json={"name": "Переезд", "move_date": "2026-11-01"})
    assert r.status_code == 201, r.text
    # план не заполняется сам; большинству тестов нужен план из шаблонов, как после кнопки
    client.post(f"/api/projects/{r.json()['id']}/tasks/apply-templates")
    return r.json()


@pytest.fixture()
def base(project):
    """Префикс путей проекта: /api/projects/{id}"""
    return f"/api/projects/{project['id']}"


def make_box(client, base, room="Кухня", items="Чайник\nКружки", **extra):
    r = client.post(f"{base}/boxes", json={"room": room, "items_text": items, **extra})
    assert r.status_code == 201, r.text
    return r.json()
