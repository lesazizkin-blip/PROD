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
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def project(client):
    r = client.post("/api/projects", json={"name": "Переезд", "move_date": "2026-11-01"})
    assert r.status_code == 201, r.text
    return r.json()


@pytest.fixture()
def base(project):
    """Префикс путей проекта: /api/projects/{id}"""
    return f"/api/projects/{project['id']}"


def make_box(client, base, room="Кухня", items="Чайник\nКружки", **extra):
    r = client.post(f"{base}/boxes", json={"room": room, "items_text": items, **extra})
    assert r.status_code == 201, r.text
    return r.json()
