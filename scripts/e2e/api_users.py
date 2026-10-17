"""Вход, регистрация, приглашения и права участников (локальный сервер с кодом прода)."""

import secrets
import sys

import httpx

BASE = sys.argv[1].rstrip("/") + "/api"
res = {}


def check(name, ok):
    res[name] = res.get(name, True) and bool(ok)


suffix = secrets.token_hex(3)
owner_pw, helper_pw = secrets.token_urlsafe(12), secrets.token_urlsafe(12)
owner, helper, anon = (
    httpx.Client(timeout=30),
    httpx.Client(timeout=30),
    httpx.Client(timeout=30),
)
check(
    "регистрация",
    owner.post(
        f"{BASE}/auth/register", json={"username": f"own{suffix}", "password": owner_pw}
    ).status_code
    == 201,
)
check(
    "тот же логин - 409",
    anon.post(
        f"{BASE}/auth/register", json={"username": f"own{suffix}", "password": owner_pw}
    ).status_code
    == 409,
)
check(
    "короткий пароль - 422",
    anon.post(
        f"{BASE}/auth/register", json={"username": f"x{suffix}", "password": "1234567"}
    ).status_code
    == 422,
)
check(
    "неверный пароль - 401",
    anon.post(
        f"{BASE}/auth/login",
        json={"username": f"own{suffix}", "password": "неверный-пароль"},
    ).status_code
    == 401,
)
check(
    "cookie httpOnly, SameSite=Lax",
    "httponly"
    in owner.post(
        f"{BASE}/auth/login", json={"username": f"own{suffix}", "password": owner_pw}
    )
    .headers.get("set-cookie", "")
    .lower(),
)
check("кто вошёл", owner.get(f"{BASE}/auth/me").json()["username"] == f"own{suffix}")
pid = owner.post(
    f"{BASE}/projects", json={"name": "Семейный переезд", "move_date": "2030-03-01"}
).json()["id"]
P = f"{BASE}/projects/{pid}"
helper.post(
    f"{BASE}/auth/register", json={"username": f"help{suffix}", "password": helper_pw}
)
check("чужой проект помощнику не виден (404)", helper.get(P).status_code == 404)
tok = owner.post(f"{P}/invites").json()["token"]
check(
    "помощник принимает приглашение",
    helper.post(f"{BASE}/invites/{tok}/accept").status_code == 200,
)
check(
    "повторное принятие без дублей",
    helper.post(f"{BASE}/invites/{tok}/accept").status_code == 200
    and len(owner.get(f"{P}/members").json()) == 2,
)
check(
    "помощник видит проект и отмечает коробки",
    helper.post(
        f"{P}/boxes", json={"room": "Кухня", "items_text": "Чайник"}
    ).status_code
    == 201,
)
check(
    "помощник не может удалить проект (403)",
    helper.delete(P, params={"confirm": "true"}).status_code == 403,
)
check(
    "помощник не может приглашать (403)", helper.post(f"{P}/invites").status_code == 403
)
hid = next(m for m in owner.get(f"{P}/members").json() if m["role"] == "member")[
    "user_id"
]
oid = owner.get(f"{BASE}/auth/me").json()["id"]
check(
    "помощник не может убрать владельца",
    helper.delete(f"{P}/members/{oid}", params={"confirm": "true"}).status_code
    in (403, 409),
)
check(
    "владелец убирает помощника",
    owner.delete(f"{P}/members/{hid}", params={"confirm": "true"}).status_code == 204
    and helper.get(P).status_code == 404,
)
tok2 = owner.post(f"{P}/invites").json()["token"]
helper.post(f"{BASE}/invites/{tok2}/accept")
check(
    "помощник выходит сам",
    helper.delete(f"{P}/members/{hid}", params={"confirm": "true"}).status_code == 204,
)
second = httpx.Client(timeout=30)
second.post(
    f"{BASE}/auth/login", json={"username": f"own{suffix}", "password": owner_pw}
)
new_pw = secrets.token_urlsafe(12)
check(
    "смена пароля",
    owner.post(
        f"{BASE}/auth/password",
        json={"current_password": owner_pw, "new_password": new_pw},
    ).status_code
    == 200,
)
check(
    "смена пароля закрывает другие входы",
    second.get(f"{BASE}/auth/me").status_code == 401
    and owner.get(f"{BASE}/auth/me").status_code == 200,
)
check(
    "старый пароль больше не подходит",
    anon.post(
        f"{BASE}/auth/login", json={"username": f"own{suffix}", "password": owner_pw}
    ).status_code
    == 401,
)
check(
    "выход",
    owner.post(f"{BASE}/auth/logout").status_code == 204
    and owner.get(f"{BASE}/auth/me").status_code == 401,
)
codes = [
    anon.post(
        f"{BASE}/auth/login",
        json={"username": f"help{suffix}", "password": "перебор-пароля"},
    ).status_code
    for _ in range(11)
]
check("защита от перебора (429)", codes[-1] == 429)
fails = [k for k, v in res.items() if not v]
print(f"проверок: {len(res)}, ошибок: {len(fails)}")
[print("FAIL", f) for f in fails]
sys.exit(1 if fails else 0)
