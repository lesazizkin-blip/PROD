"""Обновление цен на переезд по городам: python -m app.price_update (cron на ВМ раз в сутки).

Берёт со страниц Профи.ру «Стоимость грузчиков» и «Стоимость газели на час» каждого города вилку ставок
исполнителей и их число (разметка schema.org: lowPrice, highPrice, offerCount) - те же данные, что в снимке
reference_data.CITY_PRICES. Страницы /…/price/ robots.txt площадки не запрещает. Вежливо: 32 запроса
в сутки с паузой между ними. Если страница не загрузилась или числа неправдоподобны, у города остаются
прежние цены: калькулятор всегда считает по последним проверенным данным и показывает их дату.
"""

import json
import re
import sys
import time
from datetime import date

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import CityPrice

PAGES = {
    "movers": "/raznoe/pereezd/uslugi-gruzchikov/price/",
    "trucks": "/raznoe/zakazat-gazel-na-chas/price/",
}
# только ASCII: заголовки HTTP не принимают кириллицу
USER_AGENT = (
    "MoverMateBot/1.0 (moving cost calculator; once a day; "
    "+https://hack-led-20-vm1-12902f.vmaas-spirit.t-education.com)"
)
PAUSE_SECONDS = 2.0
# правдоподобные ставки, ₽/ч; новая цена не может вырасти или упасть больше чем втрое за раз
MIN_RATE, MAX_RATE, MAX_JUMP = 100, 20_000, 3

_META = re.compile(r'itemProp="(lowPrice|highPrice|offerCount)" content="(\d+)"')


def page_url(slug: str, kind: str) -> str:
    prefix = "" if slug == "msk" else f"/geo-{slug}"
    return f"https://profi.ru{prefix}{PAGES[kind]}"


def parse(html: str) -> dict[str, int]:
    """lowPrice/highPrice/offerCount первой группы на странице - вилка всей услуги. Следующий lowPrice
    начинает вилку похожей услуги: дальше не читаем, иначе отсутствующую границу подменила бы чужая."""
    found: dict[str, int] = {}
    for key, value in _META.findall(html):
        if key in found:
            break
        found[key] = int(value)
    return found


def plausible(new: dict[str, int], old_low: int, old_high: int) -> tuple[int, int, int] | None:
    low, high = new.get("lowPrice"), new.get("highPrice", old_high)
    offers = new.get("offerCount", 0)
    if low is None or not (MIN_RATE <= low <= high <= MAX_RATE) or offers < 1:
        return None
    if not (old_low / MAX_JUMP <= low <= old_low * MAX_JUMP):
        return None
    if not (old_high / MAX_JUMP <= high <= old_high * MAX_JUMP):
        return None
    return low, high, offers


def update_prices(db: Session, client: httpx.Client, pause: float = PAUSE_SECONDS) -> dict:
    report: dict = {"updated": [], "kept": {}}
    for row in db.scalars(select(CityPrice).order_by(CityPrice.slug)):
        fresh = {}
        for kind, (low, high) in (
            ("movers", (row.mover_low, row.mover_high)),
            ("trucks", (row.truck_low, row.truck_high)),
        ):
            try:
                r = client.get(page_url(row.slug, kind))
                r.raise_for_status()
                fresh[kind] = plausible(parse(r.text), low, high)
            except httpx.HTTPError as exc:
                fresh[kind] = None
                report["kept"][row.slug] = f"{kind}: {type(exc).__name__}"
            time.sleep(pause)
        if fresh["movers"] is None or fresh["trucks"] is None:
            report["kept"].setdefault(row.slug, "неправдоподобные или неполные данные")
            continue
        (row.mover_low, row.mover_high, row.movers_offers) = fresh["movers"]
        (row.truck_low, row.truck_high, row.trucks_offers) = fresh["trucks"]
        row.checked_on = date.today()
        report["updated"].append(row.slug)
    db.commit()
    return report


def main() -> int:
    with (
        SessionLocal() as db,
        httpx.Client(
            timeout=20, headers={"User-Agent": USER_AGENT}, follow_redirects=True
        ) as client,
    ):
        report = update_prices(db, client)
    print(
        json.dumps({"price_update": report, "date": date.today().isoformat()}, ensure_ascii=False)
    )
    return 0 if report["updated"] else 1


if __name__ == "__main__":
    sys.exit(main())
