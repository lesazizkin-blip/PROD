"""Исправления по аудиту 18.10: огромные id, пустой быстрый ввод, дата переезда, сроки, приглашения."""

from datetime import date


def test_huge_id_is_not_found_not_server_error(client, base):
    big = 99999999999999999999
    for path in (f"{base}/boxes/{big}", f"{base}/items/{big}/hints", f"{base}/boxes?number={big}"):
        r = client.get(path)
        assert r.status_code in (404, 422), (path, r.status_code)
    assert client.patch(f"{base}/tasks/{big}", json={"done": True}).status_code == 404


def test_empty_quick_input_is_rejected(client, base):
    n = client.post(f"{base}/boxes", json={"room": "Кухня"}).json()["number"]
    for text in ("", "\n\n  \n"):
        r = client.post(f"{base}/boxes/{n}/items/bulk", json={"text": text})
        assert r.status_code == 422


def test_move_date_must_be_plausible(client):
    assert (
        client.post("/api/projects", json={"name": "Старый", "move_date": "1900-01-01"}).status_code
        == 422
    )
    pid = client.post("/api/projects", json={"name": "Норм", "move_date": "2026-11-16"}).json()[
        "id"
    ]
    assert client.patch(f"/api/projects/{pid}", json={"move_date": "1900-01-01"}).status_code == 422


def test_changing_move_date_shifts_open_template_tasks(client):
    pid = client.post("/api/projects", json={"name": "Сдвиг", "move_date": "2026-11-16"}).json()[
        "id"
    ]
    tasks = client.get(f"/api/projects/{pid}/tasks").json()
    done, rest = tasks[0], tasks[1:]
    client.patch(f"/api/projects/{pid}/tasks/{done['id']}", json={"done": True})
    client.patch(f"/api/projects/{pid}", json={"move_date": "2026-12-16"})
    after = {t["id"]: t["due_date"] for t in client.get(f"/api/projects/{pid}/tasks").json()}
    assert after[done["id"]] == done["due_date"]  # выполненную не трогаем
    for t in rest:
        if t["due_date"]:
            shifted = date.fromisoformat(t["due_date"]).toordinal() + 30
            assert date.fromisoformat(after[t["id"]]).toordinal() == shifted


def test_removed_member_cannot_come_back_with_old_link(make_client):
    owner, helper = make_client(), make_client()
    owner.post("/api/auth/register", json={"username": "own_a", "password": "пароль-123456"})
    helper.post("/api/auth/register", json={"username": "help_a", "password": "пароль-123456"})
    pid = owner.post("/api/projects", json={"name": "Семья", "move_date": "2026-11-16"}).json()[
        "id"
    ]
    token = owner.post(f"/api/projects/{pid}/invites").json()["token"]
    assert helper.post(f"/api/invites/{token}/accept").status_code == 200
    helper_id = helper.get("/api/auth/me").json()["id"]
    assert owner.delete(f"/api/projects/{pid}/members/{helper_id}?confirm=true").status_code == 204
    assert helper.post(f"/api/invites/{token}/accept").status_code == 404
    assert helper.get(f"/api/projects/{pid}").status_code == 404


def test_search_finds_other_word_forms(client, base):
    from app.services.boxes import search_stem

    assert search_stem("зарядки") == "зарядк" and search_stem("кот") == "кот"
    n = client.post(
        f"{base}/boxes",
        json={"room": "Кухня", "items_text": "Зарядки для телефонов\nЗарядка для ноутбука\nЧайник"},
    ).json()["number"]
    names = [
        h["name"] for h in client.get(f"{base}/search", params={"q": "зарядка"}).json()["items"]
    ]
    assert names[0] == "Зарядка для ноутбука" and "Зарядки для телефонов" in names
    assert "Чайник" not in names and n == 1
