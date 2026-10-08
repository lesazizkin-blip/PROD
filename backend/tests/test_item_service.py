"""Unit-тесты бизнес-логики (без HTTP): правила переходов и права."""

import pytest

from app.errors import ConflictError, ForbiddenError, NotFoundError, ValidationFailed
from app.schemas import Action, ItemCreate, ItemUpdate, Status
from app.services.items import RULES, ItemService


def _item(db, user):
    return ItemService(db).create(ItemCreate(title="Тестовая запись", amount=100), user)


def test_new_item_is_draft_and_has_creation_event(db_session, user):
    svc = ItemService(db_session)
    item = _item(db_session, user)
    assert item.status == Status.DRAFT
    assert [e.action for e in svc.events(item.id, user)] == ["create"]


def test_happy_path_submit_then_approve(db_session, user, admin):
    svc = ItemService(db_session)
    item = _item(db_session, user)
    item = svc.transition(item.id, Action.SUBMIT, None, user)
    assert item.status == Status.IN_REVIEW
    item = svc.transition(item.id, Action.APPROVE, None, admin)
    assert item.status == Status.APPROVED
    assert [e.to_status for e in svc.events(item.id, admin)] == ["draft", "in_review", "approved"]


def test_changes_requested_returns_to_review_after_resubmit(db_session, user, admin):
    svc = ItemService(db_session)
    item = svc.transition(_item(db_session, user).id, Action.SUBMIT, None, user)
    item = svc.transition(item.id, Action.REQUEST_CHANGES, "Уточните описание", admin)
    assert item.status == Status.CHANGES_REQUESTED
    svc.update(item.id, ItemUpdate(description="Уточнил"), user)  # в этом статусе правка разрешена
    assert svc.transition(item.id, Action.SUBMIT, None, user).status == Status.IN_REVIEW


def test_reject_requires_comment(db_session, user, admin):
    svc = ItemService(db_session)
    item = svc.transition(_item(db_session, user).id, Action.SUBMIT, None, user)
    with pytest.raises(ValidationFailed):
        svc.transition(item.id, Action.REJECT, "   ", admin)


def test_user_cannot_approve_own_item(db_session, user):
    svc = ItemService(db_session)
    item = svc.transition(_item(db_session, user).id, Action.SUBMIT, None, user)
    with pytest.raises(ForbiddenError):
        svc.transition(item.id, Action.APPROVE, None, user)


def test_invalid_transition_is_conflict(db_session, user, admin):
    svc = ItemService(db_session)
    item = _item(db_session, user)
    with pytest.raises(ConflictError):  # одобрить черновик нельзя
        svc.transition(item.id, Action.APPROVE, None, admin)


def test_approved_item_is_final(db_session, user, admin):
    svc = ItemService(db_session)
    item = svc.transition(_item(db_session, user).id, Action.SUBMIT, None, user)
    svc.transition(item.id, Action.APPROVE, None, admin)
    for action in Action:
        with pytest.raises((ConflictError, ForbiddenError)):
            svc.transition(item.id, action, "x", admin if RULES[action].actor == "admin" else user)


def test_cannot_see_foreign_item(db_session, user, other_user):
    item = _item(db_session, user)
    with pytest.raises(NotFoundError):
        ItemService(db_session).get(item.id, other_user)


def test_cannot_edit_in_review(db_session, user):
    svc = ItemService(db_session)
    item = svc.transition(_item(db_session, user).id, Action.SUBMIT, None, user)
    with pytest.raises(ConflictError):
        svc.update(item.id, ItemUpdate(title="Новое название"), user)
