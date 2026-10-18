from sqlalchemy import select

from app.models import Event
from tests.conftest import make_box


def test_damage_and_search_markers_are_independent(client, base):
    box = make_box(client, base)
    item = client.get(base + f"/boxes/{box['number']}").json()["items"][0]
    url = base + f"/items/{item['id']}"
    assert client.patch(url, json={"damaged": True, "lost": True}).json()["damaged"] is True
    both = client.get(base + "/items/lost").json()
    assert both[0]["item"]["damaged"] is True
    found = client.patch(url, json={"lost": False}).json()
    assert found["lost"] is False and found["damaged"] is True
    assert client.get(base + "/items/lost").json() == []
    cleared = client.patch(url, json={"damaged": False}).json()
    assert cleared["damaged"] is False


def test_move_preserves_identity_markers_and_updates_inventory(client, base, db_session):
    a = make_box(client, base, "Кухня", "Чайник")
    b = make_box(client, base, "Спальня", "Бельё")
    item = client.get(base + f"/boxes/{a['number']}").json()["items"][0]
    before = client.patch(
        base + f"/items/{item['id']}",
        json={"first_day": True, "lost": True, "damaged": True, "quantity": 6},
    ).json()
    url = base + f"/items/{item['id']}/move"
    result = client.post(url, json={"from_box_number": a["number"], "to_box_number": b["number"]})
    assert result.status_code == 200, result.text
    assert result.json() == {**before, "box_number": b["number"]}
    assert client.get(base + f"/boxes/{a['number']}").json()["items"] == []
    dest = client.get(base + f"/boxes/{b['number']}").json()
    assert len(dest["items"]) == 2
    assert dest["status"] == b["status"]
    assert client.get(base + "/search?q=Чайник").json()["items"][0]["box_number"] == b["number"]
    assert client.get(base + "/items/first-day").json()[0]["box_number"] == b["number"]
    assert client.get(base + "/items/lost").json()[0]["box_number"] == b["number"]
    event = db_session.scalar(select(Event).where(Event.type == "item.moved"))
    assert event is not None
    # An identical retry succeeds without duplicating either the item or the event.
    assert (
        client.post(
            url, json={"from_box_number": a["number"], "to_box_number": b["number"]}
        ).status_code
        == 200
    )
    assert len(list(db_session.scalars(select(Event).where(Event.type == "item.moved")))) == 1


def test_move_checks_permissions_and_stale_source(client, base, make_client):
    a = make_box(client, base, items="Чайник")
    b = make_box(client, base, "Спальня", "Бельё")
    c = make_box(client, base, "Зал", "Книга")
    item = client.get(base + f"/boxes/{a['number']}").json()["items"][0]
    url = base + f"/items/{item['id']}/move"
    body = {"from_box_number": a["number"], "to_box_number": b["number"]}
    outsider = make_client("outsider")
    assert outsider.post(url, json=body).status_code == 404
    other = client.post("/api/projects", json={"name": "Другой", "move_date": "2026-12-01"}).json()[
        "id"
    ]
    assert (
        client.post(f"/api/projects/{other}/items/{item['id']}/move", json=body).status_code == 404
    )
    assert client.post(url, json={**body, "to_box_number": 99999}).status_code == 404
    assert client.post(url, json=body).status_code == 200
    assert client.post(url, json={**body, "to_box_number": c["number"]}).status_code == 409
    assert client.post(url, json={**body, "to_box_number": 0}).status_code == 422
    assert len(client.get(base + f"/boxes/{b['number']}").json()["items"]) == 2


def test_legacy_damage_update_sets_independent_marker(client, base):
    a = make_box(client, base, items="Чайник")
    item = client.get(base + f"/boxes/{a['number']}").json()["items"][0]
    result = client.patch(base + f"/items/{item['id']}", json={"status": "damaged"}).json()
    assert result["damaged"] is True
