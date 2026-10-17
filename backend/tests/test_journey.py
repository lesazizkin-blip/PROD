"""Полный путь переезда: калькулятор, новые этапы умного чек-листа, бюджет «план–факт»."""

from datetime import date

import pytest

from app.schemas import CalculatorIn
from app.services.calculator import estimate

BASE_CALC = {"rooms": 2, "people": 2, "distance_km": 10}


def test_calculator_requires_login_and_saves_nothing(make_client, client):
    assert make_client().post("/api/calculator", json=BASE_CALC).status_code == 401
    r = client.post("/api/calculator", json=BASE_CALC)
    assert r.status_code == 200, r.text
    d = r.json()
    assert 0 < d["boxes"]["low"] < d["boxes"]["high"]
    assert d["total"]["low"] < d["total"]["high"]
    assert d["total"]["low"] == sum(c["cost"]["low"] for c in d["costs"])
    assert {c["category"] for c in d["costs"]} >= {"movers", "transport", "materials", "cleaning"}
    assert "Ориентировочная оценка" in d["assumptions"]


def test_more_rooms_cost_more_and_need_bigger_truck():
    small = estimate(CalculatorIn(rooms=1, people=1))
    big = estimate(CalculatorIn(rooms=5, people=5))
    assert big.total.high > small.total.high
    assert big.boxes.low > small.boxes.high
    assert small.vehicle.startswith("Газель")
    assert big.movers > small.movers


def test_stairs_without_elevator_add_hours():
    lift = estimate(CalculatorIn(rooms=3, floor_from=9, elevator_from=True))
    stairs = estimate(CalculatorIn(rooms=3, floor_from=9, elevator_from=False))
    assert stairs.hours.high > lift.hours.high


def test_intercity_piano_and_pets_add_lines():
    r = estimate(CalculatorIn(rooms=2, distance_km=450, piano=True, pets=True))
    titles = " ".join(c.title for c in r.costs)
    assert "между городами" in titles and "пианино" in titles and "питомца" in titles
    assert r.prep_weeks == 4  # 2 комнаты + 1, и +1 за другой город


@pytest.mark.parametrize(
    "move_date, expected",
    [
        (date(2026, 11, 28), "Выходной день"),  # суббота, и конец месяца
        (date(2026, 11, 28), "пик переездов"),
        (date(2026, 10, 20), "закажите грузчиков"),  # мало времени до даты
        (date(2027, 1, 13), "Зима"),
        (date(2026, 3, 1), "уже прошла"),
    ],
)
def test_date_advice(move_date, expected):
    r = estimate(CalculatorIn(rooms=2, move_date=move_date), today=date(2026, 10, 17))
    assert any(expected in a for a in r.date_advice), r.date_advice


def test_good_date_is_praised():
    r = estimate(CalculatorIn(rooms=1, move_date=date(2026, 11, 18)), today=date(2026, 10, 17))
    assert r.date_advice == ["Хорошая дата: будний день вне пика переездов."]


@pytest.mark.parametrize(
    "bad",
    [
        {"rooms": 0},
        {"rooms": 9},
        {"rooms": 2, "distance_km": -1},
        {"rooms": 2, "distance_km": 501},
        {"rooms": 2, "people": 11},
        {"rooms": 2, "floor_from": 16, "elevator_from": False},
        {"rooms": 2, "floor_to": 101},
        {},
    ],
)
def test_calculator_validation(client, bad):
    assert client.post("/api/calculator", json=bad).status_code == 422


@pytest.mark.parametrize("flag", ["renting", "paperwork", "declutter", "settling"])
def test_new_journey_checklists_add_tasks_once(client, base, flag):
    r = client.post(f"{base}/assistant/checklist", json={flag: True})
    assert r.status_code == 200
    assert r.json()["suggested_tasks"] and r.json()["suggested_first_day"] == []
    added = client.post(f"{base}/assistant/checklist/apply", json={flag: True}).json()[
        "added_tasks"
    ]
    assert added == len(r.json()["suggested_tasks"])
    assert (
        client.post(f"{base}/assistant/checklist/apply", json={flag: True}).json()["added_tasks"]
        == 0
    )


def test_budget_plan_fact_and_variance(client, base):
    assert client.get(f"{base}/expenses").json() == {
        "items": [],
        "planned": 0,
        "actual": 0,
        "variance": 0,
    }
    movers = client.post(
        f"{base}/expenses", json={"category": "movers", "title": "Грузчики", "planned": 12000}
    ).json()
    client.post(
        f"{base}/expenses", json={"category": "materials", "title": "Коробки", "planned": 5000}
    )
    r = client.patch(f"{base}/expenses/{movers['id']}", json={"actual": 13500})
    assert r.status_code == 200 and r.json()["actual"] == 13500
    b = client.get(f"{base}/expenses").json()
    assert (b["planned"], b["actual"], b["variance"]) == (17000, 13500, 1500)
    # обязательные поля не обнуляются, факт можно сбросить
    assert client.patch(
        f"{base}/expenses/{movers['id']}", json={"title": None, "actual": None}
    ).json() == {
        **movers,
        "actual": None,
    }


def test_budget_delete_requires_confirm(client, base):
    e = client.post(f"{base}/expenses", json={"title": "Клининг", "planned": 6000}).json()
    assert client.delete(f"{base}/expenses/{e['id']}").status_code == 422
    assert client.delete(f"{base}/expenses/{e['id']}?confirm=true").status_code == 204
    assert client.get(f"{base}/expenses").json()["items"] == []


def test_budget_is_private_to_project_members(client, base, make_client):
    e = client.post(f"{base}/expenses", json={"title": "Грузчики", "planned": 1000}).json()
    stranger = make_client("stranger")
    assert stranger.get(f"{base}/expenses").status_code == 404
    assert stranger.patch(f"{base}/expenses/{e['id']}", json={"actual": 1}).status_code == 404
    # статья другого проекта не находится по id даже у участника своего проекта
    own = stranger.post("/api/projects", json={"name": "Свой", "move_date": "2026-11-01"}).json()
    assert (
        stranger.patch(
            f"/api/projects/{own['id']}/expenses/{e['id']}", json={"actual": 1}
        ).status_code
        == 404
    )


@pytest.mark.parametrize(
    "body",
    [
        {"title": "", "planned": 1},
        {"title": "x", "planned": -5},
        {"title": "x", "category": "casino"},
    ],
)
def test_expense_validation(client, base, body):
    assert client.post(f"{base}/expenses", json=body).status_code == 422


def test_calculator_warns_when_work_does_not_fit_into_one_day():
    small = estimate(CalculatorIn(rooms=1, people=1))
    assert not any("за один день" in a for a in small.date_advice)
    huge = estimate(
        CalculatorIn(rooms=8, floor_from=15, floor_to=15, elevator_from=False, elevator_to=False)
    )
    assert huge.hours.high > 10
    assert "за один день не успеть" in huge.date_advice[0]


def test_floor_limits_depend_on_elevator(client):
    ok = {
        "rooms": 2,
        "floor_from": 15,
        "elevator_from": False,
        "floor_to": 100,
        "elevator_to": True,
    }
    assert client.post("/api/calculator", json=ok).status_code == 200
    r = client.post("/api/calculator", json={**ok, "floor_from": 16})
    assert r.status_code == 422
    assert "без лифта" in str(r.json())
