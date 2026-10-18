"""Допустимая дата переезда - общая для проекта и ИИ-плана."""

from datetime import date, datetime, timedelta, timezone

MAX_MOVE_AHEAD_YEARS = (
    2  # переезд планируют не дальше чем на 2 года вперёд (календарных, с 29 февраля)
)
MSK = timezone(timedelta(hours=3))  # Москва без перехода на летнее время; tzdata в образе не нужен


def today_msk() -> date:
    """Сегодня по Москве: дата переезда сравнивается с календарём пользователя, а не сервера (UTC)."""
    return datetime.now(MSK).date()


def years_later(day: date, years: int) -> date:
    """Та же дата через N лет; 29 февраля в невисокосный год становится 28-м."""
    try:
        return day.replace(year=day.year + years)
    except ValueError:
        return day.replace(year=day.year + years, day=28)


def check_move_start(start: date) -> None:
    """Новая дата переезда: не в прошлом и не дальше чем через 2 года."""
    today = today_msk()
    if start < today:
        raise ValueError("Дата переезда уже прошла: выберите сегодняшнюю или будущую")
    if start > years_later(today, MAX_MOVE_AHEAD_YEARS):
        raise ValueError("Дата переезда - не дальше чем через 2 года")
