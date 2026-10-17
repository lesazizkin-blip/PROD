import app.seed as seed
from app.models import Box, Item, Project, Task


def test_demo_seed_is_complete_and_idempotent(monkeypatch, db_session):
    monkeypatch.setattr(seed, "SessionLocal", lambda: db_session)
    seed.run()
    seed.run()  # повторный запуск ничего не дублирует
    assert db_session.query(Project).count() == 1
    boxes = db_session.query(Box).all()
    assert len(boxes) == len(seed.DEMO_BOXES) + 1  # +1: коробка «заполнить позже» для напоминания
    assert {b.status for b in boxes} == {"packing", "packed", "loaded", "delivered", "unpacked"}
    assert db_session.query(Box).filter_by(fill_later=True).count() == 1
    assert db_session.query(Item).filter_by(status="lost").count() == 1
    assert db_session.query(Task).filter_by(done=True).count() == 4
    first_day = db_session.query(Item).filter_by(first_day=True).all()
    assert {i.name for i in first_day} == set(
        seed.DEMO_FIRST_DAY
    )  # чек-лист распаковки первого дня
    assert {i.name for i in first_day if i.status == "unpacked"} == {"Чайник", "Постельное бельё"}


def test_demo_lost_item_comes_back_on_restart(monkeypatch, db_session):
    monkeypatch.setattr(seed, "SessionLocal", lambda: db_session)
    seed.run()
    item = db_session.query(Item).filter_by(status="lost").one()
    item.status = "found"  # кто-то в общем демо нажал «Найдена»
    db_session.commit()
    seed.run()  # следующая выкатка
    assert db_session.query(Item).filter_by(status="lost").count() == 1


def test_reset_demo_recreates_vandalized_demo_project(db_session):
    from app.config import DEMO_PROJECT_ID
    from app.models import Box
    from app.seed import run

    run()
    boxes = db_session.query(Box).filter_by(project_id=DEMO_PROJECT_ID).count()
    db_session.query(Box).filter_by(
        project_id=DEMO_PROJECT_ID
    ).delete()  # кто-то удалил все коробки
    db_session.commit()
    run(reset_demo=True)
    db_session.expire_all()
    assert db_session.query(Box).filter_by(project_id=DEMO_PROJECT_ID).count() == boxes
