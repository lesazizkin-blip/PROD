"""Ежедневное обновление цен по городам (app.price_update) без настоящей сети."""

from datetime import date

import httpx

from app.models import CityPrice
from app.price_update import page_url, parse, update_prices
from app.reference_data import PRICES_CHECKED_ON, ensure_reference_data


def page(low: int, high: int | None, offers: int) -> str:
    high_meta = f'<meta itemProp="highPrice" content="{high}"/>' if high is not None else ""
    return (
        f'<div itemProp="offers"><meta itemProp="lowPrice" content="{low}"/>{high_meta}'
        f'<meta itemProp="offerCount" content="{offers}"/></div>'
        # ниже на странице - вилки похожих услуг, их брать нельзя
        '<meta itemProp="lowPrice" content="50"/><meta itemProp="highPrice" content="99999"/>'
    )


def client_for(pages: dict[str, str | int]) -> httpx.Client:
    def handler(request: httpx.Request) -> httpx.Response:
        body = pages.get(str(request.url), 404)
        if isinstance(body, int):
            return httpx.Response(body)
        return httpx.Response(200, text=body)

    return httpx.Client(transport=httpx.MockTransport(handler))


def test_parse_takes_the_page_range_not_related_services():
    assert parse(page(500, 900, 432)) == {"lowPrice": 500, "highPrice": 900, "offerCount": 432}
    assert page_url("msk", "movers") == "https://profi.ru/raznoe/pereezd/uslugi-gruzchikov/price/"
    assert (
        page_url("kzn", "trucks") == "https://profi.ru/geo-kzn/raznoe/zakazat-gazel-na-chas/price/"
    )


def test_update_fresh_prices_and_keep_old_on_errors_or_nonsense(db_session):
    pages = {
        page_url("kzn", "movers"): page(600, 1000, 350),
        page_url("kzn", "trucks"): page(900, 2400, 270),
        page_url("omsk", "movers"): page(550, 1100, 80),
        page_url("omsk", "trucks"): 503,  # площадка не ответила
        page_url("msk", "movers"): page(5, 1600, 5000),  # 5 ₽/ч - неправдоподобно
        page_url("msk", "trucks"): page(1000, 4500, 5800),
        page_url("ufa", "movers"): page(500, None, 130),  # без верхней границы - прежняя
        page_url("ufa", "trucks"): page(700, 1400, 110),
    }
    report = update_prices(db_session, client_for(pages), pause=0)
    assert set(report["updated"]) == {"kzn", "ufa"}
    kzn = db_session.get(CityPrice, "kzn")
    assert (kzn.mover_low, kzn.mover_high, kzn.truck_high) == (600, 1000, 2400)
    assert kzn.checked_on == date.today()
    assert db_session.get(CityPrice, "ufa").mover_high == 1000
    omsk, msk = db_session.get(CityPrice, "omsk"), db_session.get(CityPrice, "msk")
    assert omsk.mover_low == 500 and omsk.checked_on == PRICES_CHECKED_ON  # остались прежние
    assert msk.mover_low == 500 and "msk" in report["kept"]


def test_startup_does_not_roll_back_newer_prices(db_session):
    kzn = db_session.get(CityPrice, "kzn")
    kzn.mover_low, kzn.checked_on = 777, date(2099, 1, 1)
    db_session.commit()
    ensure_reference_data(db_session)  # так делает каждый старт приложения
    assert db_session.get(CityPrice, "kzn").mover_low == 777


def test_calculator_shows_date_of_the_prices_it_used(client, db_session):
    kzn = db_session.get(CityPrice, "kzn")
    kzn.checked_on = date(2026, 11, 5)
    db_session.commit()
    r = client.post("/api/calculator", json={"rooms": 2, "city": "kzn"}).json()
    assert "проверено 05.11.2026" in r["assumptions"]


def test_user_agent_is_ascii_for_http_headers():
    from app.price_update import USER_AGENT

    USER_AGENT.encode("ascii")
