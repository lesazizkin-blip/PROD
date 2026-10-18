import pytest

from tests.conftest import make_box


def test_rename_and_quantity_update_preserve_identity_and_all_markers(client, base):
    box = make_box(client, base, items="Чашка")
    item = client.get(f"{base}/boxes/{box['number']}").json()["items"][0]
    assert item["quantity"] == 1
    url = f"{base}/items/{item['id']}"
    before = client.patch(url, json={"first_day": True, "lost": True, "damaged": True}).json()
    response = client.patch(url, json={"name": "  Тарелки  ", "quantity": 6})
    assert response.status_code == 200, response.text
    assert response.json() == {**before, "name": "Тарелки", "quantity": 6}
    assert client.get(f"{base}/search?q=Чашка").json()["total"] == 0
    hit = client.get(f"{base}/search?q=тарелки").json()["items"][0]
    assert hit["quantity"] == 6 and hit["name"] == "Тарелки"
    for endpoint in ["items/first-day", "items/lost"]:
        assert client.get(f"{base}/{endpoint}").json()[0]["item"] == response.json()
    assert client.get(f"{base}/boxes/{box['number']}/label").json()["items_preview"] == [
        "Тарелки · 6 шт."
    ]
    assert client.patch(url, json={"quantity": 2}).json()["name"] == "Тарелки"
    assert client.patch(url, json={"name": "Блюдца"}).json()["quantity"] == 2


@pytest.mark.parametrize("value", [0, -1, 10000, 1.5, True, "6", None])
def test_bad_quantity_does_not_apply_rename(client, base, value):
    box = make_box(client, base, items="Чашка")
    item = client.get(f"{base}/boxes/{box['number']}").json()["items"][0]
    assert (
        client.patch(
            f"{base}/items/{item['id']}", json={"name": "Не сохранять", "quantity": value}
        ).status_code
        == 422
    )
    assert client.get(f"{base}/boxes/{box['number']}").json()["items"][0] == item
    assert (
        client.post(
            f"{base}/boxes/{box['number']}/items", json={"name": "Не создавать", "quantity": value}
        ).status_code
        == 422
    )


def test_quantity_creation_and_project_permissions(client, base, make_client):
    box = make_box(client, base, items="Чашка")
    r = client.post(
        f"{base}/boxes/{box['number']}/items", json={"name": "Тарелки", "quantity": 9999}
    )
    assert r.status_code == 201 and r.json()["quantity"] == 9999
    other = make_client("quantity-outsider")
    assert (
        other.patch(
            f"{base}/items/{r.json()['id']}", json={"name": "Чужая", "quantity": 4}
        ).status_code
        == 404
    )
    assert client.get(f"{base}/boxes/{box['number']}").json()["items"][-1] == r.json()
