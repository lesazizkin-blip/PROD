"""Юнит-тесты правил без HTTP: машина статусов, разбор быстрого ввода, нормализация."""

import itertools

import pytest

from app.errors import ConflictError, ValidationFailed
from app.services.boxes import ORDER, TRANSITIONS, check_transition, normalize, parse_lines


def test_only_the_next_lifecycle_stage_is_allowed():
    for a, b in itertools.product(ORDER, ORDER):
        if ORDER.index(b) == ORDER.index(a) + 1:
            check_transition(a, b)
        else:
            with pytest.raises(ConflictError):
                check_transition(a, b)
    assert TRANSITIONS["unpacked"] == frozenset()


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
