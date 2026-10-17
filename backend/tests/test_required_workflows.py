from sqlalchemy import select

from app.models import Box, Event, Item
from app.reference_data import FIRST_DAY_BASICS


def test_old_correction_endpoint_goes_back_only_and_is_audited(
    client, base, make_client, db_session
):
    box = client.post(base + "/boxes", json={"room": "Кухня", "items_text": "Чайник"}).json()
    url = base + f"/boxes/{box['number']}"
    for status in ["packed", "loaded"]:
        assert client.post(url + "/transitions", json={"to": status}).status_code == 200
    forward = {"to": "unpacked", "reason": "Хотим пропустить этапы"}
    assert client.post(url + "/status-corrections", json=forward).status_code == 409
    back = {"to": "packed", "reason": "Ошибочная отметка"}
    assert make_client("outsider").post(url + "/status-corrections", json=back).status_code in (
        403,
        404,
    )
    response = client.post(url + "/status-corrections", json=back)
    assert response.status_code == 200 and response.json()["status"] == "packed"
    event = db_session.scalar(
        select(Event).where(Event.type == "box.status_corrected").order_by(Event.id.desc())
    )
    assert event.data["from"] == "loaded" and event.data["to"] == "packed"
    assert event.data["actor_id"] and event.data["reason"] == "Ошибочная отметка"
    # причина необязательна
    assert (
        client.post(url + "/status-corrections", json={"to": "packing"}).json()["status"]
        == "packing"
    )


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

    def failed_log(*args, **kwargs):
        raise RuntimeError("simulated storage failure")

    with monkeypatch.context() as m:
        # сбой на последнем шаге: если сервис закоммитил раньше, вещь и пункт останутся в базе
        m.setattr("app.services.extras.log_event", failed_log)
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
