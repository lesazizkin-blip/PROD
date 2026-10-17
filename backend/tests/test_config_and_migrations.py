import sqlalchemy as sa
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext

from alembic import command
from app.config import Settings
from app.db import Base

TABLES = {
    "ai_usage_budgets",
    "projects",
    "task_templates",
    "tasks",
    "boxes",
    "box_qr_codes",
    "items",
    "first_day_items",
    "events",
    "tips",
    "users",
    "sessions",
    "project_members",
    "invites",
}


def test_settings_defaults_work_without_env(monkeypatch):
    # тесты сами задают DATABASE_URL (в CI это PostgreSQL), а проверяем значения по умолчанию
    for name in ("DATABASE_URL", "SEED_DEMO", "APP_ENV"):
        monkeypatch.delenv(name, raising=False)
    s = Settings(_env_file=None)
    assert s.database_url.startswith("sqlite")
    assert s.seed_demo is False


def _migrated_engine(tmp_path):
    url = f"sqlite:///{tmp_path / 'm.db'}"
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "head")
    return cfg, sa.create_engine(url)


def test_migrations_create_all_tables_and_roll_back(tmp_path):
    cfg, engine = _migrated_engine(tmp_path)
    assert TABLES <= set(sa.inspect(engine).get_table_names())
    command.downgrade(cfg, "base")
    assert not (TABLES & set(sa.inspect(engine).get_table_names()))


def test_migration_matches_models(tmp_path):
    """Схема из миграции не расходится с моделями: autogenerate не находит отличий."""
    _, engine = _migrated_engine(tmp_path)
    with engine.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn), Base.metadata)
    assert diff == []


def test_box_number_unique_per_project_constraint(db_session):
    import datetime
    import uuid

    import pytest
    from sqlalchemy.exc import IntegrityError

    from app.models import Box, Project

    p = Project(id=uuid.uuid4(), name="x", move_date=datetime.date(2026, 1, 1))
    db_session.add_all([p, Box(project_id=p.id, number=1, room="a")])
    db_session.commit()
    db_session.add(Box(project_id=p.id, number=1, room="b"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_data_survives_restart(tmp_path):
    # «перезапуск»: закрываем все соединения и открываем базу заново
    _, engine = _migrated_engine(tmp_path)
    with engine.begin() as c:
        c.execute(
            sa.text(
                "INSERT INTO users (username, password_hash, created_at) VALUES ('keep', 'x', '2026-10-18 00:00:00')"
            )
        )
    url = engine.url
    engine.dispose()
    with sa.create_engine(url).connect() as c:
        assert c.execute(sa.text("SELECT username FROM users")).scalar_one() == "keep"
