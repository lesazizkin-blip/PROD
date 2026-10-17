from datetime import UTC, datetime, timedelta

from tests.conftest import make_box


def advance(client, base, n, path):
    for status in path:
        assert client.post(f"{base}/boxes/{n}/transitions", json={"to": status}).status_code == 200


# ---------- чек-лист первого дня ----------
def test_first_day_checklist_starts_empty_and_crud_works(client, base):
    assert len(client.get(f"{base}/first-day").json()) == 4  # базовый список доступен до коробок
    new = client.post(f"{base}/first-day", json={"title": " Тапочки "}).json()
    assert new["title"] == "Тапочки" and new["done"] is False
    assert client.patch(f"{base}/first-day/{new['id']}", json={"done": True}).json()["done"] is True
    assert client.patch(f"{base}/first-day/{new['id']}", json={"done": None}).status_code == 422
    assert client.post(f"{base}/first-day", json={"title": ""}).status_code == 422
    assert client.delete(f"{base}/first-day/{new['id']}").status_code == 422
    assert client.delete(f"{base}/first-day/{new['id']}?confirm=true").status_code == 204
    assert client.patch(f"{base}/first-day/{new['id']}", json={"done": True}).status_code == 404


def test_first_day_is_per_project(client, base):
    other = client.post("/api/projects", json={"name": "Другой", "move_date": "2026-12-01"}).json()
    other_item = client.post(
        f"/api/projects/{other['id']}/first-day", json={"title": "Чайник"}
    ).json()
    assert (
        client.patch(f"{base}/first-day/{other_item['id']}", json={"done": True}).status_code == 404
    )


# ---------- потерянные вещи и подсказки ----------
def test_lost_items_and_hints(client, base):
    kitchen = make_box(client, base, room="Кухня", items="Чайник\nКружки")["number"]
    similar = make_box(client, base, room="Гостиная", items="Заварочный чайник\nКнига")["number"]
    same_room = make_box(client, base, room="Кухня", items="Тарелки")["number"]
    other = make_box(client, base, room="Спальня", items="Подушка")["number"]
    done = make_box(client, base, room="Кухня", items="Чайник маленький")["number"]
    advance(
        client, base, done, ["packed", "loaded", "delivered", "unpacked"]
    )  # распакована: искать там не надо

    item_id = client.get(f"{base}/boxes/{kitchen}").json()["items"][0]["id"]
    assert client.get(f"{base}/items/lost").json() == []
    client.patch(f"{base}/items/{item_id}", json={"lost": True})
    lost = client.get(f"{base}/items/lost").json()
    assert [(x["item"]["name"], x["box_number"], x["room"]) for x in lost] == [
        ("Чайник", kitchen, "Кухня")
    ]

    hints = client.get(f"{base}/items/{item_id}/hints").json()
    assert [(h["box_number"], h["reason"]) for h in hints] == [
        (kitchen, "recorded"),
        (similar, "similar_content"),
        (same_room, "same_room"),
    ]
    assert other not in [h["box_number"] for h in hints]  # чужая комната и другое содержимое
    assert done not in [h["box_number"] for h in hints]  # коробка уже распакована
    assert client.get(f"{base}/items/{item_id}/hints").json() == hints  # порядок стабилен
    assert client.get(f"{base}/items/9999/hints").status_code == 404

    client.patch(f"{base}/items/{item_id}", json={"lost": False})
    assert client.get(f"{base}/items/lost").json() == []


# ---------- напоминания ----------
def test_reminders_for_fill_later_boxes(client, base):
    make_box(client, base, items="Чайник")  # обычная коробка с вещами
    due = make_box(client, base, items="", fill_later=True)["number"]
    future = (datetime.now(UTC) + timedelta(days=2)).isoformat()
    soon = make_box(client, base, items="", fill_later=True, remind_at=future)["number"]
    past = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    late = make_box(client, base, items="", fill_later=True, remind_at=past)["number"]

    got = {r["box"]["number"]: r["overdue"] for r in client.get(f"{base}/reminders").json()}
    assert got == {due: False, late: True}  # срок в будущем: пока не напоминаем
    assert soon not in got

    client.post(
        f"{base}/boxes/{due}/items", json={"name": "Книги"}
    )  # описали - напоминание исчезло
    assert due not in {r["box"]["number"] for r in client.get(f"{base}/reminders").json()}


# ---------- массовая погрузка ----------
def test_bulk_transition_moves_all_or_nothing(client, base):
    a, b = (make_box(client, base, room="Кухня")["number"] for _ in range(2))
    c = make_box(client, base, room="Кухня", items="")[
        "number"
    ]  # пустая: дальше «собирается» нельзя
    for n in (a, b):
        advance(client, base, n, ["packed"])
    r = client.post(f"{base}/boxes/bulk-transitions", json={"numbers": [a, b], "to": "loaded"})
    assert r.status_code == 200 and [x["status"] for x in r.json()["updated"]] == [
        "loaded",
        "loaded",
    ]

    r = client.post(f"{base}/boxes/bulk-transitions", json={"numbers": [a, c], "to": "delivered"})
    assert r.status_code == 409 and f"№{c}" in r.json()["detail"]  # c пустая
    assert client.get(f"{base}/boxes/{a}").json()["status"] == "loaded"  # ничего не изменилось

    assert (
        client.post(
            f"{base}/boxes/bulk-transitions", json={"numbers": [a, 99], "to": "delivered"}
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"{base}/boxes/bulk-transitions", json={"numbers": [], "to": "loaded"}
        ).status_code
        == 422
    )
    assert (
        client.post(
            f"{base}/boxes/bulk-transitions", json={"numbers": [a], "to": "weird"}
        ).status_code
        == 422
    )
    events = client.get(f"{base}/events?type=box.status_changed").json()["items"]
    assert sum(e["data"]["to"] == "loaded" for e in events) == 2


# ---------- вещи первого дня ----------
def test_first_day_items_are_flagged_listed_and_unflagged(client, base):
    kitchen = make_box(client, base, room="Кухня", items="Кастрюля")["number"]
    bath = make_box(client, base, room="Ванная", items="")["number"]
    kettle = client.post(
        f"{base}/boxes/{kitchen}/items", json={"name": "Чайник", "first_day": True}
    ).json()
    assert kettle["first_day"] is True and kettle["status"] == "packed"
    brush = client.post(
        f"{base}/boxes/{bath}/items",
        json={"name": "Зубная щётка", "first_day": True, "status": "unpacked"},
    ).json()
    assert brush["status"] == "unpacked"
    listed = client.get(f"{base}/items/first-day").json()
    assert [(x["item"]["name"], x["box_number"], x["room"]) for x in listed] == [
        ("Чайник", kitchen, "Кухня"),
        ("Зубная щётка", bath, "Ванная"),
    ]  # по номеру коробки
    pot = client.get(f"{base}/boxes/{kitchen}").json()["items"][0]
    assert pot["first_day"] is False
    assert client.patch(f"{base}/items/{pot['id']}", json={"first_day": True}).json()["first_day"]
    client.patch(f"{base}/items/{kettle['id']}", json={"first_day": False})
    assert {x["item"]["name"] for x in client.get(f"{base}/items/first-day").json()} == {
        "Кастрюля",
        "Зубная щётка",
    }
    other = client.post("/api/projects", json={"name": "Чужой", "move_date": "2026-12-01"}).json()
    assert client.get(f"/api/projects/{other['id']}/items/first-day").json() == []
