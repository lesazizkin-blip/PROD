"""Доп. функции на живом сайте под демо-аккаунтом: ассистент, этикетки, первый день, журнал, приглашения, права."""

import sys
import uuid

import httpx

BASE = sys.argv[1].rstrip("/") + "/api"
c = httpx.Client(timeout=30)
res = {}


def check(name, ok):
    res[name] = res.get(name, True) and bool(ok)


assert c.post(f"{BASE}/auth/demo").status_code == 200
me = c.get(f"{BASE}/auth/me").json()
pid = c.post(
    f"{BASE}/projects",
    json={"name": "Проверка функций (удалится)", "move_date": "2030-02-01"},
).json()["id"]
P = f"{BASE}/projects/{pid}"
try:
    check(
        "список моих проектов содержит новый",
        any(p["id"] == pid for p in c.get(f"{BASE}/projects").json()),
    )
    check(
        "переименование и адреса проекта",
        c.patch(P, json={"name": "Проверка 2", "address_to": "ул. Лесная, 1"}).json()[
            "address_to"
        ]
        == "ул. Лесная, 1",
    )
    sug = c.post(
        f"{P}/assistant/checklist",
        json={"with_children": True, "with_pets": True, "other_city": True},
    ).json()
    check("умный чек-лист предлагает задачи", len(sug["suggested_tasks"]) > 0)
    ap = c.post(f"{P}/assistant/checklist/apply", json={"with_children": True}).json()
    check(
        "умный чек-лист добавляет и не дублирует",
        ap["added_tasks"] > 0
        and c.post(
            f"{P}/assistant/checklist/apply", json={"with_children": True}
        ).json()["added_tasks"]
        == 0,
    )
    own = c.post(
        f"{P}/tasks",
        json={
            "stage": "moving_day",
            "title": "Пианино: такелажники",
            "category": "Пианино",
            "category_color": "#7c3aed",
        },
    ).json()
    check(
        "своя особенность: задача с категорией и цветом",
        own["category"] == "Пианино" and own["category_color"] == "#7c3aed",
    )
    check(
        "задача со временем, конец раньше начала - 422",
        c.post(
            f"{P}/tasks",
            json={
                "stage": "before",
                "title": "x",
                "start_time": "12:00",
                "end_time": "10:00",
            },
        ).status_code
        == 422,
    )
    check(
        "удаление задачи с подтверждением",
        c.delete(f"{P}/tasks/{own['id']}", params={"confirm": "true"}).status_code
        == 204,
    )
    b = [
        c.post(f"{P}/boxes", json={"room": r, "items_text": t}).json()["number"]
        for r, t in [("Кухня", "Чайник\nТарелки"), ("Ванная", "Зубные щётки")]
    ]
    check(
        "правка коробки (комната)",
        c.patch(f"{P}/boxes/{b[1]}", json={"room": "Ванная комната"}).json()["room"]
        == "Ванная комната",
    )
    labels = c.get(f"{P}/labels").json()
    check("пакет этикеток для печати", [l["number"] for l in labels] == b)
    check(
        "этикетки по выбранным номерам",
        [
            l["number"]
            for l in c.get(f"{P}/labels", params={"numbers": str(b[0])}).json()
        ]
        == [b[0]],
    )
    item = c.post(
        f"{P}/boxes/{b[1]}/items",
        json={"name": "Полотенце", "first_day": True, "status": "packed"},
    ).json()
    check(
        "вещь первого дня в списке",
        any(
            x["item"]["id"] == item["id"] for x in c.get(f"{P}/items/first-day").json()
        ),
    )
    check(
        "снять пометку первого дня",
        c.patch(f"{P}/items/{item['id']}", json={"first_day": False}).json()[
            "first_day"
        ]
        is False,
    )
    for st in ["damaged", "lost", "found", "unpacked"]:
        check(
            "статусы вещи по кругу",
            c.patch(f"{P}/items/{item['id']}", json={"status": st}).json()["status"]
            == st,
        )
    check(
        "переименование вещи",
        c.patch(f"{P}/items/{item['id']}", json={"name": "Полотенца"}).json()["name"]
        == "Полотенца",
    )
    check(
        "удаление вещи с подтверждением",
        c.delete(f"{P}/items/{item['id']}", params={"confirm": "true"}).status_code
        == 204,
    )
    check(
        "коробка: пропуск статусов разрешён",
        c.post(f"{P}/boxes/{b[0]}/transitions", json={"to": "delivered"}).json()[
            "status"
        ]
        == "delivered",
    )
    check(
        "массовая смена статуса",
        len(
            c.post(
                f"{P}/boxes/bulk-transitions", json={"numbers": b, "to": "unpacked"}
            ).json()["updated"]
        )
        == 2,
    )
    check(
        "напоминания: пустой список без «заполнить позже»",
        c.get(f"{P}/reminders").json() == [],
    )
    fd = c.post(f"{P}/first-day", json={"title": "Тапочки"}).json()
    check(
        "старый чек-лист первого дня (API)",
        c.patch(f"{P}/first-day/{fd['id']}", json={"done": True}).json()["done"]
        and c.delete(
            f"{P}/first-day/{fd['id']}", params={"confirm": "true"}
        ).status_code
        == 204,
    )
    ev = c.get(f"{P}/events", params={"type": "box.status_changed"}).json()
    check(
        "журнал: фильтр по типу",
        ev["total"] >= 2
        and all(e["type"] == "box.status_changed" for e in ev["items"]),
    )
    members = c.get(f"{P}/members").json()
    check(
        "участники: владелец",
        members[0]["role"] == "owner" and members[0]["user_id"] == me["id"],
    )
    inv = c.post(f"{P}/invites").json()
    check(
        "ссылка-приглашение создаётся и открывается без входа",
        httpx.get(f"{BASE}/invites/{inv['token']}", timeout=30).json()["project_name"]
        == "Проверка 2",
    )
    check(
        "отзыв всех ссылок",
        c.request("DELETE", f"{P}/invites").json()["revoked"] >= 1
        and httpx.get(f"{BASE}/invites/{inv['token']}", timeout=30).status_code == 404,
    )
    check(
        "владельца убрать нельзя (409)",
        c.delete(f"{P}/members/{me['id']}", params={"confirm": "true"}).status_code
        == 409,
    )
    check(
        "чужой/несуществующий проект - 404",
        c.get(f"{BASE}/projects/{uuid.uuid4()}").status_code == 404,
    )
    check("без входа - 401", httpx.get(f"{P}/boxes", timeout=30).status_code == 401)
    check(
        "демо: пароль не меняется (403)",
        c.post(
            f"{BASE}/auth/password",
            json={"current_password": "x" * 8, "new_password": "y" * 8},
        ).status_code
        == 403,
    )
    check(
        "демо-проект не удаляется (403)",
        c.delete(
            f"{BASE}/projects/00000000-0000-4000-8000-000000000001",
            params={"confirm": "true"},
        ).status_code
        == 403,
    )
    check(
        "настройки сайта /api/config", "maps_provider" in c.get(f"{BASE}/config").json()
    )
    check(
        "Swagger и схема",
        httpx.get(f"{BASE}/docs", timeout=30).status_code == 200
        and len(httpx.get(f"{BASE}/openapi.json", timeout=30).json()["paths"]) >= 40,
    )
    check(
        "памятка и шаблоны",
        len(c.get(f"{BASE}/tips").json()) >= 6
        and len(c.get(f"{BASE}/task-templates").json()) == 14,
    )
finally:
    print(
        "временный проект удалён:",
        c.delete(P, params={"confirm": "true"}).status_code == 204,
    )
fails = [k for k, v in res.items() if not v]
print(f"проверок: {len(res)}, ошибок: {len(fails)}")
[print("FAIL", f) for f in fails]
sys.exit(1 if fails else 0)
