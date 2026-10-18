import uuid
from datetime import date, timedelta

from app.reference_data import TASK_TEMPLATES


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok" and r.json()["db"] == "ok"


def test_reference_endpoints(client):
    t = client.get("/api/task-templates").json()
    assert len(t) == len(TASK_TEMPLATES) and {x["stage"] for x in t} == {
        "before",
        "moving_day",
        "after",
    }
    tips = client.get("/api/tips").json()
    assert {x["topic"] for x in tips} == {"fragile", "carry_with_you", "pack_last"}
    assert all(x["topic"] == "fragile" for x in client.get("/api/tips?topic=fragile").json())
    assert client.get("/api/tips?topic=nope").status_code == 422


def test_explicit_empty_plan_and_default_templates_with_relative_dates(client, base, project):
    assert project["address_from"] is None and uuid.UUID(project["id"])
    fresh = client.post(
        "/api/projects", json={"name": "Пустой", "move_date": "2026-12-01", "plan_mode": "empty"}
    ).json()
    fresh_base = f"/api/projects/{fresh['id']}"
    assert client.get(f"{fresh_base}/tasks").json() == []  # план не заполняется сам
    assert client.get(f"{fresh_base}/first-day").json() == []  # заготовок первого дня нет
    assert client.post(f"{fresh_base}/tasks/apply-templates").json() == {
        "added": len(TASK_TEMPLATES)
    }
    tasks = client.get(f"{base}/tasks").json()
    assert len(tasks) == len(TASK_TEMPLATES)
    for stage, title, offset in TASK_TEMPLATES:  # этап и срок каждой задачи - от даты переезда
        task = next(t for t in tasks if t["title"] == title)
        assert task["stage"] == stage
        assert task["due_date"] == (date(2026, 11, 1) + timedelta(days=offset)).isoformat()
    assert len(client.get(f"{base}/first-day").json()) == 4  # заготовки первого дня
    assert [t["stage"] for t in tasks] == sorted(
        (t["stage"] for t in tasks), key=["before", "moving_day", "after"].index
    )


def test_project_validation_errors_use_common_format(client):
    r = client.post("/api/projects", json={"name": "   ", "move_date": "не дата"})
    assert r.status_code == 422
    body = r.json()
    assert body["code"] == "validation_failed" and {e["field"] for e in body["errors"]} == {
        "name",
        "move_date",
    }


def test_addresses_are_optional_and_blank_means_empty(client):
    r = client.post(
        "/api/projects",
        json={
            "name": "П",
            "move_date": "2026-11-01",
            "address_from": "  ",
            "address_to": "ул. Лесная, 1",
        },
    )
    assert r.json()["address_from"] is None and r.json()["address_to"] == "ул. Лесная, 1"


def test_get_update_unknown_project(client, base, project):
    assert client.get(base).json()["name"] == "Переезд"
    assert client.get(f"/api/projects/{uuid.uuid4()}").status_code == 404
    assert client.get("/api/projects/not-a-uuid").status_code == 422
    r = client.patch(base, json={"name": "Новое имя", "address_to": "Москва"})
    assert r.json()["name"] == "Новое имя" and r.json()["address_to"] == "Москва"
    assert client.patch(base, json={"name": None}).status_code == 422
    assert client.patch(base, json={"move_date": None}).status_code == 422


def test_delete_project_needs_confirmation_and_cascades(client, base):
    client.post(f"{base}/boxes", json={"room": "Кухня", "items_text": "Чайник"})
    assert client.delete(base).status_code == 422
    assert client.get(base).status_code == 200  # данные на месте
    assert client.delete(f"{base}?confirm=true").status_code == 204
    assert client.get(base).status_code == 404


def test_task_crud_and_events(client, base):
    r = client.post(
        f"{base}/tasks",
        json={
            "stage": "before",
            "title": " Купить скотч ",
            "assignee": "Аня",
            "due_date": "2026-10-30",
        },
    )
    assert r.status_code == 201
    task = r.json()
    assert task["title"] == "Купить скотч" and task["done"] is False and task["template_id"] is None
    tid = task["id"]

    r = client.patch(f"{base}/tasks/{tid}", json={"done": True})
    assert r.json()["done"] is True and r.json()["done_at"]
    assert client.patch(f"{base}/tasks/{tid}", json={"done": False}).json()["done_at"] is None
    assert client.patch(f"{base}/tasks/{tid}", json={"title": None}).status_code == 422
    assert client.patch(f"{base}/tasks/{tid}", json={"assignee": None}).json()["assignee"] is None
    assert client.patch(f"{base}/tasks/{tid}", json={"stage": "after"}).json()["stage"] == "after"

    assert client.delete(f"{base}/tasks/{tid}").status_code == 422
    assert client.delete(f"{base}/tasks/{tid}?confirm=true").status_code == 204
    assert client.patch(f"{base}/tasks/{tid}", json={"done": True}).status_code == 404

    types = [e["type"] for e in client.get(f"{base}/events").json()["items"]]
    assert (
        types.count("task.completed") == 1
        and types.count("task.reopened") == 1
        and "task.created" in types
    )
    assert types[-1] == "project.created"  # новые сверху


def test_task_filters_and_order(client, base):
    done = client.get(f"{base}/tasks?done=false").json()
    first = done[0]
    client.patch(f"{base}/tasks/{first['id']}", json={"done": True})
    assert first["id"] in [t["id"] for t in client.get(f"{base}/tasks?done=true").json()]
    assert all(t["stage"] == "after" for t in client.get(f"{base}/tasks?stage=after").json())
    assert client.get(f"{base}/tasks?stage=bad").status_code == 422
    # одинаковый запрос - одинаковый порядок
    assert client.get(f"{base}/tasks").json() == client.get(f"{base}/tasks").json()


def test_tasks_of_other_project_are_not_reachable(client, base):
    other = client.post("/api/projects", json={"name": "Другой", "move_date": "2026-12-01"}).json()
    client.post(f"/api/projects/{other['id']}/tasks/apply-templates")
    other_task = client.get(f"/api/projects/{other['id']}/tasks").json()[0]
    assert client.patch(f"{base}/tasks/{other_task['id']}", json={"done": True}).status_code == 404


def test_apply_templates_is_idempotent(client, base):
    assert client.post(f"{base}/tasks/apply-templates").json() == {"added": 0}
    first = client.get(f"{base}/tasks").json()[0]
    client.delete(f"{base}/tasks/{first['id']}?confirm=true")
    assert client.post(f"{base}/tasks/apply-templates").json() == {"added": 1}
    assert client.post(f"{base}/tasks/apply-templates").json() == {"added": 0}


def test_events_pagination_and_filter(client, base):
    for i in range(5):
        client.post(f"{base}/tasks", json={"stage": "before", "title": f"Задача {i}"})
    page = client.get(f"{base}/events?page=1&page_size=2").json()
    assert len(page["items"]) == 2 and page["total"] == 6 and page["page_size"] == 2
    only = client.get(f"{base}/events?type=task.created").json()
    assert only["total"] == 5
    assert client.get(f"{base}/events?page_size=500").status_code == 422


def test_task_time_and_category_with_color(client, base):
    r = client.post(
        f"{base}/tasks",
        json={
            "stage": "moving_day",
            "title": "Погрузка",
            "due_date": "2026-10-30",
            "start_time": "09:00",
            "end_time": "12:30",
            "category": " Грузчики ",
            "category_color": "#F0A04B",
        },
    )
    assert r.status_code == 201
    task = r.json()
    assert task["start_time"] == "09:00:00" and task["end_time"] == "12:30:00"
    assert task["category"] == "Грузчики" and task["category_color"] == "#F0A04B"

    # меняется только конец: он проверяется против сохранённого начала
    bad = client.patch(f"{base}/tasks/{task['id']}", json={"end_time": "08:00"})
    assert bad.status_code == 422
    ok = client.patch(f"{base}/tasks/{task['id']}", json={"end_time": "13:00"})
    assert ok.status_code == 200 and ok.json()["end_time"] == "13:00:00"

    # без категории цвета нет
    cleared = client.patch(f"{base}/tasks/{task['id']}", json={"category": None})
    assert cleared.json()["category"] is None and cleared.json()["category_color"] is None


def test_task_time_and_color_validation(client, base):
    body = {"stage": "before", "title": "Задача"}
    r = client.post(f"{base}/tasks", json={**body, "start_time": "10:00", "end_time": "10:00"})
    assert r.status_code == 422
    r = client.post(f"{base}/tasks", json={**body, "category": "Дела", "category_color": "red"})
    assert r.status_code == 422
    r = client.post(f"{base}/tasks", json={**body, "category_color": "#112233"})
    assert (
        r.status_code == 201 and r.json()["category_color"] is None
    )  # цвет без категории не хранится


def test_task_time_with_timezone_is_rejected_not_500(client, base):
    body = {"stage": "before", "title": "Задача"}
    r = client.post(
        f"{base}/tasks", json={**body, "start_time": "10:00", "end_time": "11:00+03:00"}
    )
    assert r.status_code == 422
    assert "часового пояса" in r.json()["errors"][0]["message"]

    task = client.post(f"{base}/tasks", json={**body, "start_time": "10:00"}).json()
    r = client.patch(f"{base}/tasks/{task['id']}", json={"end_time": "13:00+03:00"})
    assert r.status_code == 422


def test_client_config_hides_empty_maps_key(client, monkeypatch):
    from app.config import get_settings

    assert client.get("/api/config").json() == {"maps_api_key": None, "maps_provider": None}
    monkeypatch.setattr(get_settings(), "google_maps_api_key", " browser-key ")
    assert client.get("/api/config").json() == {
        "maps_api_key": "browser-key",
        "maps_provider": "google",
    }
    monkeypatch.setattr(get_settings(), "maptiler_api_key", "mt-key")  # MapTiler важнее Google
    assert client.get("/api/config").json() == {
        "maps_api_key": "mt-key",
        "maps_provider": "maptiler",
    }


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


def test_move_can_span_several_days(client):
    r = client.post(
        "/api/projects",
        json={"name": "Долгий", "move_date": "2026-11-01", "move_date_end": "2026-11-03"},
    )
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    assert r.json()["move_date_end"] == "2026-11-03"
    brief = next(p for p in client.get("/api/projects").json() if p["id"] == pid)
    assert brief["move_date_end"] == "2026-11-03"
    # конец раньше начала и переезд дольше месяца - 422, и при создании, и при правке
    for end in ("2026-10-31", "2026-12-15"):
        bad = {"name": "Плохой", "move_date": "2026-11-01", "move_date_end": end}
        assert client.post("/api/projects", json=bad).status_code == 422
        assert client.patch(f"/api/projects/{pid}", json={"move_date_end": end}).status_code == 422
    # перенос начала сдвигает весь переезд, если конец не прислан
    client.patch(f"/api/projects/{pid}", json={"move_date": "2026-11-10"})
    assert client.get(f"/api/projects/{pid}").json()["move_date_end"] == "2026-11-12"
    # начало позже прежнего конца вместе с новым концом - можно
    r = client.patch(
        f"/api/projects/{pid}", json={"move_date": "2026-11-20", "move_date_end": "2026-11-20"}
    )
    assert r.status_code == 200 and r.json()["move_date_end"] == "2026-11-20"
    # null - снова переезд в один день
    assert (
        client.patch(f"/api/projects/{pid}", json={"move_date_end": None}).json()["move_date_end"]
        is None
    )
    # проект без конца - как раньше
    one = client.post("/api/projects", json={"name": "Один день", "move_date": "2026-11-01"})
    assert one.json()["move_date_end"] is None


def test_health_reports_db_down(anon_client):
    from app.db import get_db
    from app.main import app

    class Down:
        def execute(self, *args, **kwargs):
            raise RuntimeError("db down")

    app.dependency_overrides[get_db] = lambda: Down()
    try:
        r = anon_client.get("/api/health")
    finally:
        app.dependency_overrides.pop(get_db, None)
    assert r.status_code == 503 and r.json()["db"] == "down"


def test_task_due_date_has_the_same_bounds_as_move_date(client, base):
    task = client.get(f"{base}/tasks").json()[0]
    assert (
        client.patch(f"{base}/tasks/{task['id']}", json={"due_date": "9999-12-30"}).status_code
        == 422
    )
    assert (
        client.post(
            f"{base}/tasks", json={"title": "x", "stage": "before", "due_date": "0001-01-02"}
        ).status_code
        == 422
    )


def test_project_update_logs_only_changed_fields(client, base):
    p = client.get(base).json()
    same = {"name": p["name"], "move_date": p["move_date"], "address_from": None}
    client.patch(base, json={**same, "name": "Новое имя"})
    events = client.get(f"{base}/events?type=project.updated").json()["items"]
    assert events[0]["data"]["fields"] == ["name"]
    client.patch(base, json={**same, "name": "Новое имя"})  # ничего не поменялось
    assert client.get(f"{base}/events?type=project.updated").json()["total"] == 1
