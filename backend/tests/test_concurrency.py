"""Гонка переходов. Имеет смысл только на PostgreSQL (в SQLite параллельные транзакции не пересекаются):
TEST_DATABASE_URL=postgresql+psycopg://app:app@localhost:5432/app pytest tests/test_concurrency.py"""

import threading
import time

import pytest
from sqlalchemy.orm import sessionmaker

from app.errors import AppError
from app.repositories.items import ItemRepository
from app.schemas import Action, ItemCreate
from app.services.items import ItemService

from .conftest import TEST_DB_URL

pytestmark = pytest.mark.skipif(
    not TEST_DB_URL.startswith("postgresql"), reason="нужен PostgreSQL (TEST_DATABASE_URL)"
)


def test_parallel_approve_and_reject_only_one_wins(db_session, user, admin, monkeypatch):
    svc = ItemService(db_session)
    item = svc.transition(
        svc.create(ItemCreate(title="Гонка статусов", amount=1), user).id, Action.SUBMIT, None, user
    )

    # Расширяем окно гонки: запись истории «медленная». Без блокировки оба запроса успели бы
    # прочитать статус in_review до того, как первый его изменит.
    original = ItemRepository.add_event

    def slow_add_event(self, event):
        time.sleep(0.4)
        return original(self, event)

    monkeypatch.setattr(ItemRepository, "add_event", slow_add_event)

    factory = sessionmaker(bind=db_session.get_bind(), autoflush=False, expire_on_commit=False)
    barrier = threading.Barrier(2)
    results: list = []

    def run(action: Action, comment: str | None):
        with factory() as session:
            actor = session.merge(admin)
            barrier.wait()
            try:
                ItemService(session).transition(item.id, action, comment, actor)
                results.append((action, "ok"))
            except AppError as exc:
                results.append((action, exc.code))

    threads = [
        threading.Thread(target=run, args=(Action.APPROVE, None)),
        threading.Thread(target=run, args=(Action.REJECT, "Не подходит")),
    ]
    [t.start() for t in threads]
    [t.join() for t in threads]

    outcomes = sorted(code for _, code in results)
    assert outcomes == ["conflict", "ok"], results

    winner = next(action for action, code in results if code == "ok")
    expected = {Action.APPROVE: "approved", Action.REJECT: "rejected"}[winner]
    db_session.expire_all()
    assert ItemService(db_session).get(item.id, admin).status == expected
    # В истории ровно один переход из in_review: второй не записан
    events = ItemService(db_session).events(item.id, admin)
    assert [e.from_status for e in events].count("in_review") == 1
