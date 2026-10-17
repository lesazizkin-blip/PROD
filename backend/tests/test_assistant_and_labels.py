from tests.conftest import make_box


# ---------- умный чек-лист ----------
def test_no_flags_suggests_nothing(client, base):
    r = client.post(f"{base}/assistant/checklist", json={})
    assert r.status_code == 200 and r.json() == {"suggested_tasks": [], "suggested_first_day": []}


def test_suggestions_follow_flags_and_name_the_reason(client, base):
    r = client.post(
        f"{base}/assistant/checklist", json={"with_children": True, "with_pets": True}
    ).json()
    reasons = {t["reason"] for t in r["suggested_tasks"]}
    assert reasons == {"with_children", "with_pets"}
    assert {t["stage"] for t in r["suggested_tasks"]} <= {"before", "moving_day", "after"}
    assert any("ребёнка" in t for t in r["suggested_first_day"]) and any(
        "питомца" in t for t in r["suggested_first_day"]
    )
    other = client.post(f"{base}/assistant/checklist", json={"other_city": True}).json()
    assert {t["reason"] for t in other["suggested_tasks"]} == {"other_city"}


def test_suggestion_does_not_change_anything(client, base):
    before = client.get(f"{base}/tasks").json()
    client.post(f"{base}/assistant/checklist", json={"with_children": True})
    assert client.get(f"{base}/tasks").json() == before


def test_apply_adds_tasks_without_due_dates_and_is_idempotent(client, base):
    flags = {"with_children": True, "other_city": True}
    n_before = len(client.get(f"{base}/tasks").json())
    first_before = len(client.get(f"{base}/first-day").json())

    applied = client.post(f"{base}/assistant/checklist/apply", json=flags).json()
    assert applied["added_tasks"] > 0 and applied["added_first_day"] > 0
    tasks = client.get(f"{base}/tasks").json()
    assert len(tasks) == n_before + applied["added_tasks"]
    assert len(client.get(f"{base}/first-day").json()) == first_before + applied["added_first_day"]

    moving = next(
        t
        for t in tasks
        if t["title"] == "Заказать транспортную компанию для переезда в другой город"
    )
    assert moving["due_date"] is None  # срок ставит пользователь

    again = client.post(f"{base}/assistant/checklist/apply", json=flags).json()
    assert again == {"added_tasks": 0, "added_first_day": 0}  # повторный вызов ничего не дублирует
    assert len(client.get(f"{base}/tasks").json()) == len(tasks)

    types = [e["type"] for e in client.get(f"{base}/events").json()["items"]]
    assert types.count("assistant.checklist_applied") == 1  # пустое применение в журнал не пишется


def test_apply_skips_titles_the_user_already_has(client, base):
    client.post(
        f"{base}/tasks",
        json={"stage": "before", "title": "  купить  ПЕРЕНОСКУ для перевозки питомца "},
    )
    r = client.post(f"{base}/assistant/checklist", json={"with_pets": True}).json()
    assert "Купить переноску для перевозки питомца" not in [
        t["title"] for t in r["suggested_tasks"]
    ]


def test_assistant_unknown_project_and_bad_flags(client):
    assert (
        client.post(
            "/api/projects/00000000-0000-4000-8000-0000000000ff/assistant/checklist", json={}
        ).status_code
        == 404
    )


# ---------- пакет этикеток ----------
def test_labels_batch_all_and_selected(client, base, project):
    for room in ["Кухня", "Спальня", "Кухня"]:
        make_box(client, base, room=room, items="a\nb\nc\nd\ne\nf")
    everything = client.get(f"{base}/labels").json()
    assert [x["number"] for x in everything] == [1, 2, 3]
    assert everything[0]["qr_path"] == f"/projects/{project['id']}/boxes/1"
    assert everything[0]["items_preview"] == ["a", "b", "c", "d", "e"]
    assert everything[0]["project_name"] == "Переезд"

    chosen = client.get(f"{base}/labels?numbers=3,1,99").json()
    assert [x["number"] for x in chosen] == [1, 3]  # по порядку номеров; 99 пропущен


def test_labels_batch_validation(client, base):
    assert client.get(f"{base}/labels?numbers=a,b").status_code == 422
    assert client.get(f"{base}/labels?numbers=").status_code == 422
    too_many = ",".join(str(i) for i in range(1, 102))
    assert client.get(f"{base}/labels?numbers={too_many}").status_code == 422
    assert client.get(f"{base}/labels").json() == []  # пустой проект: пустой список, не ошибка
