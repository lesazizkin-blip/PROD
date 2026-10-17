"""Калькулятор переезда (этап «решение»): объём, коробки, машина, грузчики, время, бюджет «от–до», сроки.

Правила локальные, без внешних сервисов. Коэффициенты - ориентир для крупного города, их легко поправить здесь же;
пользователю результат показывается как оценка, а не как цена подрядчика."""

from datetime import date

from app.schemas import CalculatorIn, CalculatorOut, CostLine, Range

# коробки: на комнату и на человека (одежда, личные вещи)
BOXES_PER_ROOM = (15, 22)
BOXES_PER_PERSON = (5, 8)
# объём груза с мебелью, м³ на комнату
VOLUME_PER_ROOM = (6, 9)
# цены, ₽: грузчик в час, машина в час (по городу), километр (межгород), коробка, плёнка и скотч, уборка на комнату
MOVER_HOUR = (700, 900)
TRUCK_HOUR = (1200, 1800)
TRUCK_KM = (45, 70)
BOX_PRICE = (90, 150)
WRAP = (1500, 3000)
CLEANING_ROOM = (2500, 4000)
PIANO = (8000, 15000)
PET_TRANSFER = (1500, 5000)
MIN_HOURS = 4  # минимальный заказ грузчиков и машины
INTERCITY_KM = 100  # дальше - перевозка между городами, считается по километрам

ASSUMPTIONS = (
    "Ориентировочная оценка по средним ценам крупного города: грузчики "
    f"{MOVER_HOUR[0]}–{MOVER_HOUR[1]} ₽/ч, машина {TRUCK_HOUR[0]}–{TRUCK_HOUR[1]} ₽/ч, "
    f"коробка {BOX_PRICE[0]}–{BOX_PRICE[1]} ₽. Точную цену назовёт подрядчик."
)


def _r(value: float, step: int = 500) -> int:
    return int(round(value / step) * step)


def _vehicle(volume: int, distance_km: int) -> str:
    if distance_km > INTERCITY_KM:
        return "Перевозка между городами: грузовик или сборный груз транспортной компании"
    if volume <= 10:
        return "Газель (до 10 м³)"
    if volume <= 20:
        return "Грузовик 18–20 м³"
    if volume <= 35:
        return "Грузовик 35 м³"
    return "Две машины или фура"


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


def estimate(body: CalculatorIn, today: date | None = None) -> CalculatorOut:
    today = today or date.today()
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
                low=_r(MOVER_HOUR[0] * movers * hours.low),
                high=_r(MOVER_HOUR[1] * movers * hours.high),
            ),
        )
    ]
    if intercity:
        costs.append(
            CostLine(
                category="transport",
                title=f"Перевозка между городами, {body.distance_km} км",
                cost=Range(
                    low=_r(TRUCK_KM[0] * body.distance_km + TRUCK_HOUR[0] * MIN_HOURS),
                    high=_r(TRUCK_KM[1] * body.distance_km + TRUCK_HOUR[1] * MIN_HOURS),
                ),
            )
        )
    else:
        costs.append(
            CostLine(
                category="transport",
                title=f"{_vehicle(volume.high, body.distance_km)}, {hours.low}–{hours.high} ч",
                cost=Range(low=_r(TRUCK_HOUR[0] * hours.low), high=_r(TRUCK_HOUR[1] * hours.high)),
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
    return CalculatorOut(
        boxes=boxes,
        volume_m3=volume,
        vehicle=_vehicle(volume.high, body.distance_km),
        movers=movers,
        hours=hours,
        prep_weeks=prep_weeks,
        costs=costs,
        total=Range(low=sum(c.cost.low for c in costs), high=sum(c.cost.high for c in costs)),
        date_advice=_date_advice(body.move_date, prep_weeks, today),
        assumptions=ASSUMPTIONS,
    )
