from datetime import date, timedelta

from sqlalchemy import select

from app.models import Box, Event, Item
from app.reference_data import FIRST_DAY_BASICS, TASK_TEMPLATES


def test_default_and_explicit_empty_plans(client):
    for mode, count in [("standard", len(TASK_TEMPLATES)), ("empty", 0)]:
        body = {"name": mode, "move_date": "2026-12-01"}
        if mode == "empty":
            body["plan_mode"] = mode
        result = client.post("/api/projects", json=body)
        assert result.status_code == 201
        base = "/api/projects/" + result.json()["id"]
        tasks = client.get(base + "/tasks").json()
        assert len(tasks) == count
        assert len(client.get(base + "/first-day").json()) == (4 if count else 0)
        for stage, title, offset in TASK_TEMPLATES if count else []:
            task = next(t for t in tasks if t["title"] == title)
            assert task["stage"] == stage
            assert task["due_date"] == (date(2026, 12, 1) + timedelta(days=offset)).isoformat()


def test_correction_is_backward_audited_and_not_a_forward_bypass(
    client, base, make_client, db_session
):
    box = client.post(base + "/boxes", json={"room": "Кухня", "items_text": "Чайник"}).json()
    url = base + f"/boxes/{box['number']}"
    assert (
        client.post(
            url + "/status-corrections", json={"to": "unpacked", "reason": "Хотим пропустить этапы"}
        ).status_code
        == 409
    )
    assert client.post(url + "/transitions", json={"to": "loaded"}).status_code == 409
    for status in ["packed", "loaded"]:
        assert client.post(url + "/transitions", json={"to": status}).status_code == 200
    # назад - обычным переходом, без причины; в журнале обычное событие смены статуса
    assert client.post(url + "/transitions", json={"to": "packed"}).json()["status"] == "packed"
    assert client.post(url + "/transitions", json={"to": "loaded"}).status_code == 200
    # старая ручка исправления: причина теперь необязательна
    assert client.post(url + "/status-corrections", json={"to": "packed"}).status_code == 200
    assert client.post(url + "/transitions", json={"to": "loaded"}).status_code == 200
    assert make_client("outsider").post(
        url + "/status-corrections", json={"to": "packed", "reason": "Ошибочная отметка"}
    ).status_code in (403, 404)
    response = client.post(
        url + "/status-corrections", json={"to": "packed", "reason": "Погрузку отметили ошибочно"}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "packed"
    event = db_session.scalar(
        select(Event).where(Event.type == "box.status_corrected").order_by(Event.id.desc())
    )
    assert event.data["from"] == "loaded" and event.data["to"] == "packed"
    assert event.data["actor_id"] and event.data["reason"] == "Погрузку отметили ошибочно"
    assert client.post(url + "/transitions", json={"to": "unpacked"}).status_code == 409


def test_bulk_rejects_skip_without_partial_updates(client, base):
    numbers = [
        client.post(base + "/boxes", json={"room": "Кухня", "items_text": "Чайник"}).json()[
            "number"
        ]
        for _ in range(2)
    ]
    client.post(base + f"/boxes/{numbers[0]}/transitions", json={"to": "packed"})
    assert (
        client.post(
            base + "/boxes/bulk-transitions", json={"numbers": numbers, "to": "loaded"}
        ).status_code
        == 409
    )
    assert [client.get(base + f"/boxes/{n}").json()["status"] for n in numbers] == [
        "packed",
        "packing",
    ]


def test_300_boxes_and_search_pages_include_last_room(client, base, project, db_session):
    import uuid

    pid = uuid.UUID(project["id"])
    for n in range(1, 301):
        box = Box(project_id=pid, number=n, room="Последняя комната" if n > 200 else "Кухня")
        db_session.add(box)
        db_session.flush()
        db_session.add(Item(box_id=box.id, name=f"Книга {n}", name_norm=f"книга {n}"))
    db_session.commit()
    boxes = []
    for page in range(1, 10):
        chunk = client.get(base + f"/boxes?page={page}&page_size=36").json()
        assert chunk["total"] == 300
        boxes += chunk["items"]
    assert [b["number"] for b in boxes] == list(range(1, 301))
    filtered = client.get(base + "/boxes?room=Последняя%20комната&page_size=200").json()
    assert filtered["total"] == 100 and filtered["items"][-1]["number"] == 300
    summary = client.get(base + "/progress").json()
    assert summary["boxes_total"] == 300
    assert {r["room"]: r["total"] for r in summary["rooms"]} == {
        "Кухня": 200,
        "Последняя комната": 100,
    }
    hits = []
    for page in range(1, 7):
        chunk = client.get(base + f"/search?q=Книга&page={page}&page_size=50").json()
        assert chunk["total"] == 300
        hits += chunk["items"]
    assert len({h["item_id"] for h in hits}) == 300
    assert hits[-1]["box_number"] == 300
    assert client.get(base + "/search?q=Книга&room=Последняя%20комната").json()["total"] == 100


def test_ai_first_day_visible_and_atomic_binding_reuses_existing_item(client, make_client):
    response = client.post(
        "/api/projects",
        json={
            "name": "AI",
            "move_date": "2026-12-01",
            "personal_plan": {
                "tasks": [{"title": "Подготовить переноску", "stage": "before", "offset_days": -2}],
                "first_day": ["Корм для кошки", "Корм для кошки"],
            },
        },
    )
    assert response.status_code == 201
    base = "/api/projects/" + response.json()["id"]
    planned = client.get(base + "/first-day").json()
    assert set(FIRST_DAY_BASICS) <= {p["title"] for p in planned}
    assert sum(p["title"] == "Корм для кошки" for p in planned) == 1
    entry = next(p for p in planned if p["title"] == "Корм для кошки")
    url = base + f"/first-day/{entry['id']}/bind"
    assert client.post(url, json={"box_number": 999, "name": "Корм для кошки"}).status_code == 404
    assert any(p["id"] == entry["id"] for p in client.get(base + "/first-day").json())
    box = client.post(
        base + "/boxes", json={"room": "Кухня", "items_text": "Корм для кошки"}
    ).json()
    assert make_client("outside").post(url, json={"box_number": box["number"]}).status_code in (
        403,
        404,
    )
    bound = client.post(url, json={"box_number": box["number"]})
    assert bound.status_code == 200 and bound.json()["first_day"] is True
    assert len(client.get(base + f"/boxes/{box['number']}").json()["items"]) == 1
    assert not any(p["id"] == entry["id"] for p in client.get(base + "/first-day").json())
    assert client.get(base + "/items/first-day").json()[0]["item"]["name"] == "Корм для кошки"
    assert client.post(url, json={"box_number": box["number"]}).status_code == 404
    assert len(client.get(base + f"/boxes/{box['number']}").json()["items"]) == 1


def test_first_day_binding_rolls_back_preparation_and_inventory_on_failure(
    client, base, db_session, monkeypatch
):
    import pytest

    from app.models import FirstDayItem
    from app.services.extras import FirstDayService

    entry = client.get(base + "/first-day").json()[0]
    box = client.post(base + "/boxes", json={"room": "Кухня", "items_text": ""}).json()

    def failed_flush(*args, **kwargs):
        raise RuntimeError("simulated storage failure")

    with monkeypatch.context() as m:
        m.setattr(db_session, "flush", failed_flush)
        with pytest.raises(RuntimeError, match="storage failure"):
            FirstDayService(db_session).bind(
                __import__("uuid").UUID(base.split("/")[-1]),
                entry["id"],
                box["number"],
                "Новая вещь",
            )
        db_session.rollback()
    assert db_session.get(FirstDayItem, entry["id"]) is not None
    assert client.get(base + f"/boxes/{box['number']}").json()["items"] == []
