import sqlalchemy as sa
from alembic.config import Config

from alembic import command
from app.security import create_access_token, decode_access_token, hash_password, verify_password


def test_password_hash_roundtrip():
    stored = hash_password("secret-pass")
    assert stored != "secret-pass"
    assert verify_password("secret-pass", stored)
    assert not verify_password("other", stored)
    assert not verify_password("x", "garbage")


def test_hashes_are_salted():
    assert hash_password("same") != hash_password("same")


def test_token_roundtrip():
    assert decode_access_token(create_access_token(42)) == 42


def test_migrations_create_all_tables(tmp_path):
    """alembic upgrade head должен создавать ту же схему, что описана в моделях."""
    url = f"sqlite:///{tmp_path / 'm.db'}"
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "head")
    tables = set(sa.inspect(sa.create_engine(url)).get_table_names())
    assert {"users", "items", "item_events", "alembic_version"} <= tables
    command.downgrade(cfg, "base")
    assert "items" not in set(sa.inspect(sa.create_engine(url)).get_table_names())


def test_ensure_admin_is_idempotent(db_session):
    from app.services.auth import AuthService

    auth = AuthService(db_session)
    auth.ensure_admin("boss@example.com", "password123", "Босс")
    auth.ensure_admin("boss@example.com", "password123", "Босс")
    assert auth.users.count() == 1
    assert auth.users.get_by_email("boss@example.com").role == "admin"
