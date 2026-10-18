from sqlalchemy import event

from tests.conftest import make_box


def test_preview_is_bounded_ordered_and_has_current_quantities(client, base):
    box = make_box(
        client, base, items="Чайник\nКружки\nТарелки\nЛожки\nВилки\nСекретный шестой предмет"
    )
    card = client.get(f"{base}/boxes/{box['number']}").json()
    item = card["items"][1]
    assert client.patch(f"{base}/items/{item['id']}", json={"quantity": 4}).status_code == 200
    page = client.get(f"{base}/boxes").json()
    assert page["items"][0]["items_count"] == 6
    assert page["items"][0]["contents_preview"] == [
        {"name": name, "quantity": 4 if name == "Кружки" else 1}
        for name in ["Чайник", "Кружки", "Тарелки", "Ложки", "Вилки"]
    ]
    empty = make_box(client, base, items="")
    assert empty["contents_preview"] == []


def test_search_finds_beyond_preview_rooms_numbers_and_excludes_source_before_paging(client, base):
    first = make_box(
        client, base, room="Детская", items="Один\nДва\nТри\nЧетыре\nПять\nЁлочные игрушки"
    )
    second = make_box(client, base, room="Спальня", items="Ёлочные украшения")
    third = make_box(client, base, room="СПАЛЬНЯ", items="Книги")
    matches = client.get(
        f"{base}/boxes", params={"q": "елочн", "exclude_number": first["number"], "page_size": 1}
    ).json()
    assert matches["total"] == 1
    assert matches["items"][0]["number"] == second["number"]
    full_matches = client.get(f"{base}/boxes", params={"q": "елочн"}).json()
    assert full_matches["total"] == 2
    assert full_matches["items"][0]["contents_preview"][0]["name"] == "Ёлочные игрушки"
    rooms = client.get(f"{base}/boxes", params={"q": "спальня"}).json()
    assert [b["number"] for b in rooms["items"]] == [second["number"], third["number"]]
    assert (
        client.get(f"{base}/boxes", params={"q": "001"}).json()["items"][0]["number"]
        == first["number"]
    )
    assert client.get(f"{base}/boxes", params={"q": "%"}).json()["total"] == 0
    assert client.get(f"{base}/boxes", params={"q": "x" * 121}).status_code == 422


def test_contents_search_and_previews_stay_inside_project(client, base):
    make_box(client, base, items="Своя вещь")
    other = client.post("/api/projects", json={"name": "Другой", "move_date": "2026-12-01"}).json()
    make_box(client, f"/api/projects/{other['id']}", items="Чужая опись")
    assert client.get(f"{base}/boxes", params={"q": "Чужая"}).json()["total"] == 0
    assert (
        client.get(f"{base}/boxes").json()["items"][0]["contents_preview"][0]["name"] == "Своя вещь"
    )


def test_preview_query_count_does_not_grow_with_page_size(client, base, db_session):
    for _ in range(12):
        make_box(client, base, items="А\nБ\nВ\nГ\nД\nЕ")
    queries = []

    def count_selects(connection, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            queries.append(statement)

    engine = db_session.get_bind()
    event.listen(engine, "before_cursor_execute", count_selects)
    try:
        client.get(f"{base}/boxes", params={"page_size": 1})
        single_count = len(queries)
        queries.clear()
        page = client.get(f"{base}/boxes", params={"page_size": 12}).json()
        assert len(queries) == single_count
        assert len(page["items"]) == 12
        assert all(len(box["contents_preview"]) == 5 for box in page["items"])
    finally:
        event.remove(engine, "before_cursor_execute", count_selects)
