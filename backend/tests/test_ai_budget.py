from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.config import Settings
from app.errors import TooManyRequestsError
from app.models import AiUsageBudget
from app.services.ai_budget import reserve_attempt
from app.services.planner import PlannerUnavailable

NOW = datetime(2026, 10, 17, 12, 15, tzinfo=UTC)


@pytest.fixture()
def budget_db(tmp_path):
    # Файловая SQLite: отдельные соединения и сессии, как у нескольких workers.
    url = f"sqlite:///{tmp_path / 'budget.db'}"
    engine = create_engine(url, connect_args={"timeout": 10})
    AiUsageBudget.__table__.create(engine)
    yield engine, url
    engine.dispose()


def test_budget_survives_new_session_and_engine(budget_db):
    engine, url = budget_db
    settings = Settings(ai_requests_per_hour=1)
    with Session(engine) as db:
        reserve_attempt(db, 1, settings, now=NOW)
    engine.dispose()
    fresh_engine = create_engine(url)
    try:
        with Session(fresh_engine) as db, pytest.raises(TooManyRequestsError):
            reserve_attempt(db, 1, settings, now=NOW)
    finally:
        fresh_engine.dispose()


def test_global_cap_cannot_be_bypassed_with_many_users(budget_db):
    engine, _ = budget_db
    settings = Settings(ai_global_requests_per_day=2)
    with Session(engine) as db:
        reserve_attempt(db, 1, settings, now=NOW)
        reserve_attempt(db, 2, settings, now=NOW)
        with pytest.raises(TooManyRequestsError, match="дневной"):
            reserve_attempt(db, 3, settings, now=NOW)
        assert db.get(AiUsageBudget, f"global:{NOW:%Y-%m-%d}").used == 2


def test_user_cap_rejection_does_not_burn_global_budget(budget_db):
    engine, _ = budget_db
    settings = Settings(ai_requests_per_hour=1, ai_global_requests_per_day=2)
    with Session(engine) as db:
        reserve_attempt(db, 1, settings, now=NOW)
        for _ in range(4):
            with pytest.raises(TooManyRequestsError):
                reserve_attempt(db, 1, settings, now=NOW)
        reserve_attempt(db, 2, settings, now=NOW)
        assert db.get(AiUsageBudget, f"global:{NOW:%Y-%m-%d}").used == 2


def test_reset_windows_are_driven_by_server_utc_clock(budget_db):
    engine, _ = budget_db
    settings = Settings(ai_requests_per_hour=1, ai_global_requests_per_day=2)
    with Session(engine) as db:
        reserve_attempt(db, 1, settings, now=NOW)
        reserve_attempt(db, 1, settings, now=NOW + timedelta(hours=1))
        with pytest.raises(TooManyRequestsError):
            reserve_attempt(db, 1, settings, now=NOW + timedelta(hours=2))
        reserve_attempt(db, 1, settings, now=NOW + timedelta(days=1))


@pytest.mark.parametrize("same_user", [False, True])
def test_parallel_reservations_never_overshoot(budget_db, same_user):
    engine, _ = budget_db
    settings = Settings(ai_requests_per_hour=3, ai_global_requests_per_day=5)

    def attempt(i):
        with Session(engine) as db:
            try:
                reserve_attempt(db, 1 if same_user else i, settings, now=NOW)
                return True
            except TooManyRequestsError:
                return False

    with ThreadPoolExecutor(max_workers=10) as pool:
        assert sum(pool.map(attempt, range(50))) == (3 if same_user else 5)
    with Session(engine) as db:
        assert db.get(AiUsageBudget, f"global:{NOW:%Y-%m-%d}").used == (3 if same_user else 5)


def test_disabled_ai_and_missing_budget_table_fail_closed(budget_db):
    engine, _ = budget_db
    with Session(engine) as db, pytest.raises(TooManyRequestsError):
        reserve_attempt(db, 1, Settings(ai_global_requests_per_day=0), now=NOW)
    AiUsageBudget.__table__.drop(engine)
    with Session(engine) as db, pytest.raises(PlannerUnavailable):
        reserve_attempt(db, 1, Settings(), now=NOW)


def test_counter_does_not_store_descriptions_or_credentials(budget_db):
    engine, _ = budget_db
    with Session(engine) as db:
        reserve_attempt(db, 1, Settings(), now=NOW)
        assert len(db.scalars(select(AiUsageBudget)).all()) == 2
    assert set(AiUsageBudget.__table__.columns.keys()) == {"bucket", "used"}
