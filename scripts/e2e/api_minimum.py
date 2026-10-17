"""Минимум ТЗ (пункты docs/CASE.md) по API. Входит в демо-аккаунт, создаёт временный проект и удаляет его.
Запуск: scripts/e2e.sh (или backend/.venv/bin/python scripts/e2e/api_minimum.py <адрес сайта>)."""

import sys

import httpx

BASE = sys.argv[1].rstrip("/") + "/api"
c = httpx.Client(timeout=30, headers={"X-MoverMate-Check": "e2e"})
res: dict[int, bool] = {}


def check(n: int, ok: bool) -> None:
    res[n] = res.get(n, True) and bool(ok)


assert c.post(f"{BASE}/auth/demo").status_code == 200
r = c.post(
    f"{BASE}/projects",
    json={"name": "ТЗ-проверка (удалится)", "move_date": "2030-01-01"},
)
check(1, r.status_code == 201 and r.json()["address_from"] is None)
check(32, r.status_code == 201)  # адреса необязательны
pid = r.json()["id"]
P = f"{BASE}/projects/{pid}"
try:
    check(
        3,
        len(c.get(f"{BASE}/task-templates").json()) >= 10
        and c.post(f"{P}/tasks/apply-templates").json()["added"] == 0,
    )
    tasks = c.get(f"{P}/tasks").json()
    check(2, {t["stage"] for t in tasks} == {"before", "moving_day", "after"})
    t = c.post(
        f"{P}/tasks",
        json={
            "stage": "before",
            "title": "Своя",
            "due_date": "2029-12-25",
            "assignee": "Аня",
        },
    ).json()
    check(4, t["due_date"] == "2029-12-25" and t["assignee"] == "Аня")
    check(
        5, c.patch(f"{P}/tasks/{t['id']}", json={"done": True}).json()["done"] is True
    )

    b1 = c.post(
        f"{P}/boxes", json={"room": "Кухня", "items_text": "Чайник\nКружки"}
    ).json()
    b2 = c.post(f"{P}/boxes", json={"room": "Спальня", "items_text": "Бельё"}).json()
    check(6, b1["number"] != b2["number"] and b1["room"] == "Кухня")
    check(27, b1["number"] != b2["number"])
    n = b1["number"]
    card = c.get(f"{P}/boxes/{n}").json()
    check(7, [i["name"] for i in card["items"]] == ["Чайник", "Кружки"])
    bulk = c.post(f"{P}/boxes/{n}/items/bulk", json={"text": "Тостер\nЛожки"})
    check(8, bulk.status_code == 201 and len(bulk.json()["created"]) == 2)
    later = c.post(f"{P}/boxes", json={"room": "Кабинет", "fill_later": True}).json()
    check(
        9,
        any(
            x["box"]["number"] == later["number"]
            for x in c.get(f"{P}/reminders").json()
        ),
    )
    path = ["packed", "loaded", "delivered", "unpacked"]
    check(
        10,
        all(
            c.post(f"{P}/boxes/{n}/transitions", json={"to": s}).json()["status"] == s
            for s in path
        ),
    )
    check(
        29,
        c.post(f"{P}/boxes/{n}/transitions", json={"to": "unpacked"}).status_code == 409
        and c.post(
            f"{P}/boxes/{later['number']}/transitions", json={"to": "packed"}
        ).status_code
        == 200,
    )
    s1 = c.get(f"{P}/search", params={"q": "чайник"}).json()
    s2 = c.get(f"{P}/search", params={"q": "чайник"}).json()
    check(12, s1["total"] == 1)
    check(13, all(k in s1["items"][0] for k in ("box_number", "room", "status")))
    check(30, s1 == s2)
    check(
        14, c.get(f"{P}/boxes", params={"number": n}).json()["items"][0]["number"] == n
    )
    label = c.get(f"{P}/boxes/{n}/label").json()
    check(15, label["number"] == n and label["qr_path"] == f"/projects/{pid}/boxes/{n}")
    total = c.get(f"{P}/boxes").json()["total"]
    c.get(f"{P}/boxes/{n}")
    c.get(f"{P}/boxes/{n}")
    check(28, c.get(f"{P}/boxes").json()["total"] == total)
    check(
        16, c.get(f"{BASE[:-4]}/projects/{pid}/boxes/{n}").status_code == 200
    )  # ссылка из QR отдаёт сайт

    c.post(f"{P}/boxes/{b2['number']}/transitions", json={"to": "packed"})
    c.post(
        f"{P}/boxes/bulk-transitions", json={"numbers": [b2["number"]], "to": "loaded"}
    )
    prog = c.get(f"{P}/progress").json()
    rooms = {r["room"]: r for r in prog["rooms"]}
    check(19, rooms["Спальня"]["loaded"] == 1)
    check(
        20,
        c.post(
            f"{P}/boxes/{b2['number']}/transitions", json={"to": "delivered"}
        ).json()["status"]
        == "delivered",
    )
    prog = c.get(f"{P}/progress").json()
    check(21, sum(prog["by_status"].values()) == prog["boxes_total"])
    check(
        22, {r["room"]: r for r in prog["rooms"]}["Кухня"]["unpacked_percent"] == 100.0
    )

    item = c.post(
        f"{P}/boxes/{b2['number']}/items",
        json={"name": "Зубная щётка", "first_day": True},
    ).json()
    check(
        23,
        any(x["item"]["id"] == item["id"] for x in c.get(f"{P}/items/first-day").json())
        and c.patch(f"{P}/items/{item['id']}", json={"status": "unpacked"}).json()[
            "status"
        ]
        == "unpacked",
    )
    kettle = card["items"][0]
    check(
        24,
        c.patch(f"{P}/items/{kettle['id']}", json={"status": "lost"}).json()["lost"]
        is True,
    )
    check(25, c.get(f"{P}/items/{kettle['id']}/hints").status_code == 200)
    tips = c.get(f"{BASE}/tips").json()
    check(26, {t["topic"] for t in tips} == {"fragile", "carry_with_you", "pack_last"})
    check(
        31,
        c.get(f"{P}/tasks").json() == c.get(f"{P}/tasks").json()
        and any(x["id"] == t["id"] and x["done"] for x in c.get(f"{P}/tasks").json()),
    )
    types = {
        e["type"]
        for e in c.get(f"{P}/events", params={"page_size": 200}).json()["items"]
    }
    check(
        35,
        {
            "project.created",
            "box.created",
            "box.status_changed",
            "task.completed",
            "item.lost",
        }
        <= types,
    )
    check(36, c.get(f"{BASE}/health").json()["status"] == "ok")
    check(
        11,
        c.delete(f"{P}/boxes/{later['number']}").status_code == 422
        and c.delete(
            f"{P}/boxes/{later['number']}", params={"confirm": "true"}
        ).status_code
        == 204,
    )
finally:
    gone = c.delete(P, params={"confirm": "true"}).status_code
    print("временный проект удалён:", gone == 204)
fails = [k for k in sorted(res) if not res[k]]
print(f"пунктов ТЗ: {len(res)}, ошибок: {len(fails)}")
for k in fails:
    print("FAIL пункт", k)
sys.exit(1 if fails else 0)
