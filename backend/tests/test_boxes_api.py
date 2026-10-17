from concurrent.futures import ThreadPoolExecutor

import pytest

from tests.conftest import TEST_DB_URL, make_box


def test_box_numbers_are_sequential_and_unique_per_project(client, base):
    numbers = [make_box(client, base)["number"] for _ in range(3)]
    assert numbers == [1, 2, 3]
    other = client.post("/api/projects", json={"name": "Другой", "move_date": "2026-12-01"}).json()
    assert (
        make_box(client, f"/api/projects/{other['id']}")["number"] == 1
    )  # нумерация своя в каждом проекте


def test_deleted_number_is_not_reused(client, base):
    make_box(client, base)
    make_box(client, base)
    assert client.delete(f"{base}/boxes/2?confirm=true").status_code == 204
    # номер удалённой коробки не выдаётся снова: старая наклейка с QR не откроет чужую коробку
    assert make_box(client, base)["number"] == 3
    client.delete(f"{base}/boxes/1?confirm=true")
    assert make_box(client, base)["number"] == 4


def test_create_box_with_quick_input_and_defaults(client, base):
    box = make_box(client, base, items="Чайник\nКружки (4 шт)\n\nТостер")
    assert box["status"] == "packing" and box["items_count"] == 3 and box["fill_later"] is False
    card = client.get(f"{base}/boxes/{box['number']}").json()
    assert [i["name"] for i in card["items"]] == ["Чайник", "Кружки (4 шт)", "Тостер"]
    assert all(i["box_number"] == box["number"] for i in card["items"])


def test_box_validation(client, base):
    assert client.post(f"{base}/boxes", json={"room": "   "}).status_code == 422
    assert client.post(f"{base}/boxes", json={}).status_code == 422
    assert client.get(f"{base}/boxes/0").status_code == 404
    assert client.get(f"{base}/boxes/999").status_code == 404
    assert client.get(f"{base}/boxes/abc").status_code == 422


def test_scanning_qr_twice_opens_same_box_and_creates_nothing(client, base):
    box = make_box(client, base)
    first = client.get(f"{base}/boxes/{box['number']}").json()
    second = client.get(f"{base}/boxes/{box['number']}").json()
    assert first == second
    assert client.get(f"{base}/boxes").json()["total"] == 1


def test_transitions_follow_the_rules(client, base):
    n = make_box(client, base)["number"]
    url = f"{base}/boxes/{n}/transitions"
    assert client.post(url, json={"to": "unpacked"}).status_code == 409
    assert client.post(url, json={"to": "packing"}).status_code == 409
    for status in ["packed", "loaded", "delivered", "unpacked"]:
        assert client.post(url, json={"to": status}).json()["status"] == status
    assert client.post(url, json={"to": "weird"}).status_code == 422
    assert client.post(f"{base}/boxes/99/transitions", json={"to": "packed"}).status_code == 404


def test_empty_box_cannot_be_packed_unless_fill_later(client, base):
    empty = make_box(client, base, items="")["number"]
    for status in ["packed", "loaded", "unpacked"]:
        assert (
            client.post(f"{base}/boxes/{empty}/transitions", json={"to": status}).status_code == 409
        )
    later = make_box(client, base, items="", fill_later=True)["number"]
    assert (
        client.post(f"{base}/boxes/{later}/transitions", json={"to": "packed"}).status_code == 200
    )
    client.post(f"{base}/boxes/{empty}/items", json={"name": "Книги"})
    assert (
        client.post(f"{base}/boxes/{empty}/transitions", json={"to": "packed"}).status_code == 200
    )


def test_status_change_is_logged(client, base):
    n = make_box(client, base)["number"]
    client.post(f"{base}/boxes/{n}/transitions", json={"to": "packed"})
    events = client.get(f"{base}/events?type=box.status_changed").json()["items"]
    assert events[0]["data"] == {"from": "packing", "to": "packed"}
    assert client.get(f"{base}/events?type=box.created").json()["total"] == 1


def test_list_filters_and_pagination(client, base):
    for room in ["Кухня", "Кухня", "Спальня"]:
        make_box(client, base, room=room)
    client.post(f"{base}/boxes/1/transitions", json={"to": "packed"})
    assert client.get(f"{base}/boxes?room=Кухня").json()["total"] == 2
    assert client.get(f"{base}/boxes?status=packed").json()["total"] == 1
    assert client.get(f"{base}/boxes?number=3").json()["items"][0]["room"] == "Спальня"
    page = client.get(f"{base}/boxes?page=2&page_size=2").json()
    assert [b["number"] for b in page["items"]] == [3] and page["total"] == 3
    assert client.get(f"{base}/boxes?page_size=1000").status_code == 422
    assert client.get(f"{base}/boxes?status=bad").status_code == 422


def test_delete_box_needs_confirm_and_removes_items(client, base):
    n = make_box(client, base)["number"]
    assert client.delete(f"{base}/boxes/{n}").status_code == 422
    assert client.get(f"{base}/boxes/{n}").status_code == 200
    assert client.delete(f"{base}/boxes/{n}?confirm=true").status_code == 204
    assert client.get(f"{base}/boxes/{n}").status_code == 404
    assert client.get(f"{base}/search?q=чайник").json()["total"] == 0


def test_update_box(client, base):
    n = make_box(client, base)["number"]
    r = client.patch(f"{base}/boxes/{n}", json={"room": "Гостиная", "fill_later": True})
    assert r.json()["room"] == "Гостиная" and r.json()["fill_later"] is True
    assert client.patch(f"{base}/boxes/{n}", json={"room": None}).status_code == 422


def test_items_add_bulk_lost_delete(client, base):
    n = make_box(client, base, items="")["number"]
    one = client.post(f"{base}/boxes/{n}/items", json={"name": " Чайник "}).json()
    assert one["name"] == "Чайник"
    bulk = client.post(f"{base}/boxes/{n}/items/bulk", json={"text": "Кружка\nКружка\nТостер"})
    assert bulk.status_code == 201 and len(bulk.json()["created"]) == 3  # дубли допустимы
    assert (
        client.post(
            f"{base}/boxes/{n}/items/bulk", json={"text": "\n".join("x" * 5 for _ in range(201))}
        ).status_code
        == 422
    )
    assert client.post(f"{base}/boxes/{n}/items", json={"name": ""}).status_code == 422

    assert one["status"] == "packed" and one["lost"] is False
    lost = client.patch(f"{base}/items/{one['id']}", json={"lost": True}).json()
    assert lost["lost"] is True and lost["status"] == "lost"  # старый формат по-прежнему работает
    assert client.get(f"{base}/search?q=чайник").json()["items"][0]["lost"] is True
    assert client.delete(f"{base}/items/{one['id']}").status_code == 422
    assert client.delete(f"{base}/items/{one['id']}?confirm=true").status_code == 204
    assert client.patch(f"{base}/items/{one['id']}", json={"lost": False}).status_code == 404
    page = client.get(f"{base}/boxes/{n}/items?page_size=2").json()
    assert page["total"] == 3 and len(page["items"]) == 2
    types = [e["type"] for e in client.get(f"{base}/events").json()["items"]]
    assert "item.lost" in types


def test_item_status_is_chosen_freely_and_logged(client, base):
    n = make_box(client, base, items="Ваза")["number"]
    item_id = client.get(f"{base}/boxes/{n}").json()["items"][0]["id"]
    url = f"{base}/items/{item_id}"
    # любой статус из любого: вещь может найтись, сломаться или оказаться на месте когда угодно
    for status in ["damaged", "lost", "found", "unpacked", "packed"]:
        r = client.patch(url, json={"status": status})
        assert r.status_code == 200 and r.json()["status"] == status
        assert r.json()["lost"] is (status == "lost")
    assert client.patch(url, json={"status": "broken"}).status_code == 422
    hit = client.get(f"{base}/search?q=ваза").json()["items"][0]
    assert hit["item_status"] == "packed" and hit["status"] == "packing"  # вещь и коробка отдельно
    events = client.get(f"{base}/events?type=item.status_changed").json()["items"]
    assert {"from": "found", "to": "unpacked"} in [
        {k: e["data"][k] for k in ("from", "to")} for e in events
    ]
    types = [e["type"] for e in client.get(f"{base}/events").json()["items"]]
    assert "item.lost" in types and "item.found" in types


def test_items_of_other_project_are_not_reachable(client, base):
    n = make_box(client, base)["number"]
    item_id = client.get(f"{base}/boxes/{n}").json()["items"][0]["id"]
    other = client.post("/api/projects", json={"name": "Другой", "move_date": "2026-12-01"}).json()
    assert (
        client.patch(
            f"/api/projects/{other['id']}/items/{item_id}", json={"lost": True}
        ).status_code
        == 404
    )


def test_label_has_qr_path_and_preview(client, base, project):
    n = make_box(client, base, room="Кухня", items="a\nb\nc\nd\ne\nf\ng")["number"]
    label = client.get(f"{base}/boxes/{n}/label").json()
    assert label["number"] == n and label["room"] == "Кухня" and label["project_name"] == "Переезд"
    assert label["qr_path"] == f"/projects/{project['id']}/boxes/{n}"
    assert label["items_preview"] == ["a", "b", "c", "d", "e"]
    assert client.get(f"{base}/boxes/99/label").status_code == 404


def test_search_is_case_insensitive_yo_and_deterministic(client, base):
    make_box(client, base, room="Кухня", items="Чайник электрический\nЧайник")
    make_box(client, base, room="Гостиная", items="Заварочный чайник\nЁлка")
    make_box(client, base, room="Спальня", items="Подушка")
    hits = client.get(f"{base}/search?q=ЧАЙНИК").json()
    names = [(h["name"], h["box_number"]) for h in hits["items"]]
    # точное совпадение, затем слово в начале, затем вхождение; внутри группы по номеру коробки
    assert names == [("Чайник", 1), ("Чайник электрический", 1), ("Заварочный чайник", 2)]
    assert hits["items"][0]["room"] == "Кухня" and hits["items"][0]["status"] == "packing"
    assert client.get(f"{base}/search?q=елка").json()["total"] == 1  # ё = е
    again = client.get(f"{base}/search?q=ЧАЙНИК").json()
    assert again == hits  # одинаковый запрос - одинаковый ответ
    assert client.get(f"{base}/search?q=%25").json()["total"] == 0  # % - обычный символ, не шаблон
    assert client.get(f"{base}/search?q=").status_code == 422
    assert client.get(f"{base}/search?q=%20%20").status_code == 422


def test_search_pagination(client, base):
    make_box(client, base, items="\n".join(f"Книга {i}" for i in range(7)))
    p1 = client.get(f"{base}/search?q=книга&page=1&page_size=3").json()
    p3 = client.get(f"{base}/search?q=книга&page=3&page_size=3").json()
    assert p1["total"] == 7 and len(p1["items"]) == 3 and len(p3["items"]) == 1


def test_progress_by_status_and_room(client, base):
    assert client.get(f"{base}/progress").json() == {
        "boxes_total": 0,
        "by_status": {s: 0 for s in ["packing", "packed", "loaded", "delivered", "unpacked"]},
        "unpacked_percent": 0.0,
        "rooms": [],
        "coverage": 0.0,
    }
    a = make_box(client, base, room="Кухня")["number"]
    b = make_box(client, base, room="Кухня")["number"]
    c = make_box(client, base, room="Спальня", items="")["number"]
    for n, path in [(a, ["packed", "loaded", "delivered", "unpacked"]), (b, ["packed", "loaded"])]:
        for s in path:
            client.post(f"{base}/boxes/{n}/transitions", json={"to": s})
    p = client.get(f"{base}/progress").json()
    assert (
        p["boxes_total"] == 3 and p["by_status"]["unpacked"] == 1 and p["by_status"]["loaded"] == 1
    )
    assert p["by_status"]["packing"] == 1 and p["unpacked_percent"] == 33.3
    assert p["coverage"] == 0.67  # у двух из трёх коробок есть вещи
    kitchen, bedroom = p["rooms"]
    assert (kitchen["room"], kitchen["total"], kitchen["loaded"], kitchen["loaded_percent"]) == (
        "Кухня",
        2,
        2,
        100.0,
    )
    assert (kitchen["unpacked"], kitchen["unpacked_percent"]) == (1, 50.0)
    assert (bedroom["room"], bedroom["loaded"], bedroom["unpacked_percent"]) == ("Спальня", 0, 0.0)
    assert c  # коробка без вещей учтена в total


def test_number_collision_is_retried_not_duplicated(client, base, monkeypatch):
    """Если другой запрос занял номер, UNIQUE(project_id, number) не даёт дубль, а сервис берёт следующий."""
    from app.services.boxes import BoxService

    make_box(client, base)
    stale = iter([1])  # первая попытка предлагает уже занятый номер 1
    real = BoxService._next_number
    monkeypatch.setattr(
        BoxService, "_next_number", lambda self, pid: next(stale, None) or real(self, pid)
    )
    assert make_box(client, base)["number"] == 2
    assert client.get(f"{base}/boxes").json()["total"] == 2


@pytest.mark.skipif(
    TEST_DB_URL.startswith("sqlite"),
    reason="параллельность проверяется на PostgreSQL (make test-pg)",
)
def test_parallel_box_creation_gives_unique_numbers(client, base):
    from sqlalchemy.orm import sessionmaker

    from app.db import engine, get_db
    from app.main import app

    def own_session():  # у каждого запроса своя сессия, как в проде
        with sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)() as s:
            yield s

    app.dependency_overrides[get_db] = own_session

    def create(_):
        return client.post(f"{base}/boxes", json={"room": "Кухня"}).status_code

    with ThreadPoolExecutor(max_workers=5) as pool:
        codes = list(pool.map(create, range(10)))
    assert all(c in (201, 409) for c in codes)
    numbers = [b["number"] for b in client.get(f"{base}/boxes?page_size=200").json()["items"]]
    assert len(numbers) == len(set(numbers)) == codes.count(201)
