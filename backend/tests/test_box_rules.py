"""Юнит-тесты правил без HTTP: машина статусов, разбор быстрого ввода, нормализация."""

import itertools

import pytest

from app.errors import ConflictError, ValidationFailed
from app.services.boxes import ORDER, TRANSITIONS, check_transition, normalize, parse_lines


@pytest.mark.parametrize(("a", "b"), [(ORDER[i], ORDER[i + 1]) for i in range(4)])
def test_one_step_forward_allowed(a, b):
    check_transition(a, b)


@pytest.mark.parametrize(("a", "b"), [(ORDER[i + 1], ORDER[i]) for i in range(4)])
def test_one_step_back_allowed(a, b):
    check_transition(a, b)


def test_every_other_transition_is_rejected():
    allowed = {(a, b) for a, targets in TRANSITIONS.items() for b in targets}
    for a, b in itertools.product(ORDER, ORDER):
        if (a, b) not in allowed:
            with pytest.raises(ConflictError):
                check_transition(a, b)


def test_cannot_unpack_undelivered_box():
    with pytest.raises(ConflictError, match="packing"):
        check_transition("packing", "unpacked")
    with pytest.raises(ConflictError):
        check_transition("loaded", "unpacked")


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
