"""Калькулятор переезда (этап «решение»): объём, коробки, машина, грузчики, время, бюджет «от–до», сроки.

Правила локальные, без внешних сервисов. Ставки грузчиков и машины берутся из цен города (таблица city_prices,
данные Профи.ру, см. reference_data.CITY_PRICES); остальное - средние по России ниже. Результат - оценка,
а не цена подрядчика."""

from dataclasses import dataclass
from datetime import date

from app.reference_data import CITY_PRICES, PRICES_CHECKED_ON, PRICES_SOURCE
from app.schemas import CalculatorIn, CalculatorOut, CostLine, Range

# коробки: на комнату и на человека (одежда, личные вещи)
BOXES_PER_ROOM = (15, 22)
BOXES_PER_PERSON = (5, 8)
# объём груза с мебелью, м³ на комнату
VOLUME_PER_ROOM = (6, 9)
# цены по России, ₽: километр (межгород), коробка, плёнка и скотч, уборка на комнату
TRUCK_KM = (45, 70)
BOX_PRICE = (90, 150)
WRAP = (1500, 3000)
CLEANING_ROOM = (2500, 4000)
PIANO = (8000, 15000)
PET_TRANSFER = (1500, 5000)
MIN_HOURS = 4  # минимальный заказ грузчиков и машины
WORKDAY_HOURS = 10  # дольше за один день грузчики не работают: работу делят на дни
INTERCITY_KM = 100  # дальше - перевозка между городами, считается по километрам

# машина больше Газели дороже: по тарифной сетке перевозчика (Газель 8–10 м³ - 1200 ₽/ч, 16–18 м³ - 1300,
# 25–35 м³ - 2500; pereezdekb.com, 17.10.2026); две машины - вдвое к грузовику 18–20 м³
VEHICLE_FACTOR = {"gazel": 1.0, "truck20": 1.1, "truck35": 2.1, "two": 2.2}


@dataclass(frozen=True)
class Rates:
    """Ставки за час для расчёта: нижняя граница - минимум исполнителей, верхняя - середина их вилки
    (максимум на площадке - крупные машины и премиум, для обычного переезда он завышает оценку)."""

    city: str | None
    mover: tuple[int, int]
    truck: tuple[int, int]
    offers: int


def _typical(low: int, high: int) -> tuple[int, int]:
    return low, round((low + high) / 2)


def city_rates(name: str, movers: tuple[int, int, int], trucks: tuple[int, int, int]) -> Rates:
    return Rates(name, _typical(*movers[:2]), _typical(*trucks[:2]), movers[2] + trucks[2])


def average_rates() -> Rates:
    """Город не выбран: средние ставки по всем городам справочника."""
    n = len(CITY_PRICES)
    ml = round(sum(c[2][0] for c in CITY_PRICES) / n)
    mh = round(sum(c[2][1] for c in CITY_PRICES) / n)
    tl = round(sum(c[3][0] for c in CITY_PRICES) / n)
    th = round(sum(c[3][1] for c in CITY_PRICES) / n)
    offers = sum(c[2][2] + c[3][2] for c in CITY_PRICES)
    return Rates(None, _typical(ml, mh), _typical(tl, th), offers)


def _assumptions(r: Rates) -> str:
    where = f"в г. {r.city}" if r.city else f"в среднем по {len(CITY_PRICES)} крупным городам"
    return (
        f"Цены {where}: грузчик {r.mover[0]}–{r.mover[1]} ₽/ч, Газель {r.truck[0]}–{r.truck[1]} ₽/ч "
        f"({PRICES_SOURCE}, {r.offers} исполнителей, проверено {PRICES_CHECKED_ON:%d.%m.%Y}). "
        f"Коробки {BOX_PRICE[0]}–{BOX_PRICE[1]} ₽, упаковка, уборка и межгород — средние по России. "
        "Точную цену назовёт подрядчик."
    )


def _r(value: float, step: int = 500) -> int:
    return int(round(value / step) * step)


def _vehicle(volume: int, distance_km: int) -> str:
    if distance_km > INTERCITY_KM:
        return "Перевозка между городами: грузовик или сборный груз транспортной компании"
    return _VEHICLE_NAMES[_vehicle_kind(volume)]


def _vehicle_kind(volume: int) -> str:
    if volume <= 10:
        return "gazel"
    if volume <= 20:
        return "truck20"
    if volume <= 35:
        return "truck35"
    return "two"


_VEHICLE_NAMES = {
    "gazel": "Газель (до 10 м³)",
    "truck20": "Грузовик 18–20 м³",
    "truck35": "Грузовик 35 м³",
    "two": "Две машины или фура",
}


def _floors_without_elevator(body: CalculatorIn) -> int:
    floors = 0
    if not body.elevator_from:
        floors += max(0, body.floor_from - 1)
    if not body.elevator_to:
        floors += max(0, body.floor_to - 1)
    return floors


def _date_advice(move_date: date | None, prep_weeks: int, today: date) -> list[str]:
    if move_date is None:
        return [
            "Дешевле и спокойнее переезжать в будний день в середине месяца.",
            f"Начните готовиться примерно за {prep_weeks} нед. до даты.",
        ]
    advice = []
    days_left = (move_date - today).days
    if days_left < 0:
        advice.append("Дата уже прошла: выберите новую.")
    elif days_left < prep_weeks * 7:
        advice.append(
            f"До переезда {days_left} дн., а рекомендуемая подготовка - {prep_weeks} нед.: "
            "закажите грузчиков и коробки в первую очередь."
        )
    if move_date.weekday() >= 5:
        advice.append(
            "Выходной день: грузчики заняты сильнее и часто дороже - будний день выгоднее."
        )
    if move_date.day >= 25 or move_date.day <= 5:
        advice.append(
            "Конец и начало месяца - пик переездов (заканчивается аренда): бронируйте заранее."
        )
    if move_date.month in (12, 1, 2):
        advice.append(
            "Зима: технику и растения упакуйте от мороза, после перевозки дайте технике согреться."
        )
    if not advice:
        advice.append("Хорошая дата: будний день вне пика переездов.")
    return advice


def estimate(
    body: CalculatorIn, rates: Rates | None = None, today: date | None = None
) -> CalculatorOut:
    today = today or date.today()
    rates = rates or average_rates()
    mover_hour, truck_hour = rates.mover, rates.truck
    fragile = 1.1 if body.many_fragile else 1.0
    boxes = Range(
        low=round((body.rooms * BOXES_PER_ROOM[0] + body.people * BOXES_PER_PERSON[0]) * fragile),
        high=round((body.rooms * BOXES_PER_ROOM[1] + body.people * BOXES_PER_PERSON[1]) * fragile),
    )
    volume = Range(low=body.rooms * VOLUME_PER_ROOM[0], high=body.rooms * VOLUME_PER_ROOM[1])
    movers = 2 if volume.high <= 12 else 3 if volume.high <= 25 else 4
    intercity = body.distance_km > INTERCITY_KM

    # погрузка и разгрузка: по объёму, плюс этажи без лифта; дорога - по расстоянию (по городу 25 км/ч)
    handling = volume.high / 4 + 0.15 * _floors_without_elevator(body)
    road = 0 if intercity else body.distance_km / 25
    hours_high = max(MIN_HOURS, handling + road)
    hours = Range(low=max(MIN_HOURS, round(hours_high * 0.75)), high=round(hours_high + 0.49))

    costs = [
        CostLine(
            category="movers",
            title=f"Грузчики: {movers} чел. × {hours.low}–{hours.high} ч",
            cost=Range(
                low=_r(mover_hour[0] * movers * hours.low),
                high=_r(mover_hour[1] * movers * hours.high),
            ),
        )
    ]
    if intercity:
        costs.append(
            CostLine(
                category="transport",
                title=f"Перевозка между городами, {body.distance_km} км",
                cost=Range(
                    low=_r(TRUCK_KM[0] * body.distance_km + truck_hour[0] * MIN_HOURS),
                    high=_r(TRUCK_KM[1] * body.distance_km + truck_hour[1] * MIN_HOURS),
                ),
            )
        )
    else:
        factor = VEHICLE_FACTOR[_vehicle_kind(volume.high)]
        costs.append(
            CostLine(
                category="transport",
                title=f"{_vehicle(volume.high, body.distance_km)}, {hours.low}–{hours.high} ч",
                cost=Range(
                    low=_r(truck_hour[0] * factor * hours.low),
                    high=_r(truck_hour[1] * factor * hours.high),
                ),
            )
        )
    costs.append(
        CostLine(
            category="materials",
            title=f"Коробки ({boxes.low}–{boxes.high} шт.), плёнка и скотч",
            cost=Range(
                low=_r(BOX_PRICE[0] * boxes.low + WRAP[0]),
                high=_r(BOX_PRICE[1] * boxes.high + WRAP[1]),
            ),
        )
    )
    costs.append(
        CostLine(
            category="cleaning",
            title="Уборка старой квартиры",
            cost=Range(
                low=_r(CLEANING_ROOM[0] * body.rooms), high=_r(CLEANING_ROOM[1] * body.rooms)
            ),
        )
    )
    if body.piano:
        costs.append(
            CostLine(
                category="services",
                title="Перевозка пианино",
                cost=Range(low=PIANO[0], high=PIANO[1]),
            )
        )
    if body.pets:
        costs.append(
            CostLine(
                category="services",
                title="Переноска и перевозка питомца",
                cost=Range(low=PET_TRANSFER[0], high=PET_TRANSFER[1]),
            )
        )

    prep_weeks = min(8, (2 if body.rooms <= 1 else body.rooms + 1) + (1 if intercity else 0))
    advice = _date_advice(body.move_date, prep_weeks, today)
    if hours.high > WORKDAY_HOURS:
        days = -(-hours.high // WORKDAY_HOURS)
        advice.insert(
            0,
            f"Работы на {hours.low}–{hours.high} ч: за один день не успеть. Планируйте переезд на "
            f"{days} дн. или заказывайте больше грузчиков; без лифта крупную мебель лучше поднимать такелажникам.",
        )
    return CalculatorOut(
        boxes=boxes,
        volume_m3=volume,
        vehicle=_vehicle(volume.high, body.distance_km),
        movers=movers,
        hours=hours,
        prep_weeks=prep_weeks,
        costs=costs,
        total=Range(low=sum(c.cost.low for c in costs), high=sum(c.cost.high for c in costs)),
        date_advice=advice,
        assumptions=_assumptions(rates),
        city=rates.city,
    )
