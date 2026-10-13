import os

# TEST_DATABASE_URL=postgresql+psycopg://... прогоняет все тесты на PostgreSQL (так делает CI)
TEST_DB_URL = os.environ.get("TEST_DATABASE_URL") or "sqlite://"
os.environ["DATABASE_URL"] = TEST_DB_URL
os.environ["SECRET_KEY"] = "test-secret-key-that-is-long-enough-for-hs256"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.db import Base, get_db, make_engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
from app.security import hash_password  # noqa: E402


@pytest.fixture()
def db_session():
    """Чистая in-memory БД на каждый тест."""
    engine = make_engine(TEST_DB_URL)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    yield session
    session.close()
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture(autouse=True)
def _reset_login_limiter():
    from app.ratelimit import login_limiter

    login_limiter.clear()
    yield
    login_limiter.clear()


@pytest.fixture()
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def make_user(db, email: str, role: str = "user", name: str = "Тест Тестов") -> User:
    user = User(email=email, full_name=name, password_hash=hash_password("password123"), role=role)
    db.add(user)
    db.commit()
    return user


@pytest.fixture()
def user(db_session):
    return make_user(db_session, "user@example.com")


@pytest.fixture()
def other_user(db_session):
    return make_user(db_session, "other@example.com", name="Другой Пользователь")


@pytest.fixture()
def admin(db_session):
    return make_user(db_session, "admin@example.com", role="admin", name="Админ")


def auth_headers(client: TestClient, email: str) -> dict:
    r = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture()
def user_h(client, user):
    return auth_headers(client, user.email)


@pytest.fixture()
def other_h(client, other_user):
    return auth_headers(client, other_user.email)


@pytest.fixture()
def admin_h(client, admin):
    return auth_headers(client, admin.email)
