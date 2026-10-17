"""Юнит-тесты правил без HTTP: машина статусов, разбор быстрого ввода, нормализация."""

import itertools

import pytest

from app.errors import ConflictError, ValidationFailed
from app.services.boxes import ORDER, TRANSITIONS, check_transition, normalize, parse_lines


def test_forward_one_stage_or_back_to_any_earlier_stage():
    for a, b in itertools.product(ORDER, ORDER):
        i, j = ORDER.index(a), ORDER.index(b)
        if j == i + 1 or j < i:  # вперёд на один этап или назад на любой
            check_transition(a, b)
        else:
            with pytest.raises(ConflictError):
                check_transition(a, b)
    assert TRANSITIONS["packing"] == frozenset({"packed"})
    assert TRANSITIONS["unpacked"] == frozenset(ORDER[:-1])


@pytest.mark.parametrize("s", ORDER)
def test_same_status_is_rejected(s):
    with pytest.raises(ConflictError, match="уже"):
        check_transition(s, s)


def test_unknown_status_is_rejected():
    with pytest.raises(ConflictError):
        check_transition("packing", "lost")


def test_parse_lines_trims_and_skips_blank():
    assert parse_lines("  Чайник \n\n  \nКружки (4 шт)\r\nТостер") == [
        "Чайник",
        "Кружки (4 шт)",
        "Тостер",
    ]
    assert parse_lines("") == []


def test_parse_lines_limits():
    with pytest.raises(ValidationFailed):
        parse_lines("\n".join(str(i) for i in range(201)))
    with pytest.raises(ValidationFailed):
        parse_lines("я" * 121)


def test_normalize_case_yo_and_spaces():
    assert normalize("  Ёлка   ЗЕЛЁНАЯ ") == "елка зеленая"
