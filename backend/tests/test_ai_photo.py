"""Фото-помощник: опись коробки и раскладка комнаты. Провайдер подменён MockTransport, сети нет."""

import base64
import json

import httpx
import pytest

from app.config import Settings, get_settings
from app.main import app
from app.services import planner
from tests.conftest import make_box

REAL_CLIENT = httpx.Client  # до подмен фикстурами

# настоящий 1x1 JPEG не нужен: сервер проверяет только формат data URL и base64
IMAGE = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xff" + b"0" * 64).decode()
INVENTORY = {
    "items": [
        {"name": "Электрический чайник", "first_day": True, "fragile": False},
        {"name": "электрический  чайник", "first_day": True, "fragile": False},
        {"name": "Кружки (4 шт)", "first_day": True, "fragile": True},
    ]
}
ROOM = {
    "boxes": [
        {
            "label": "Посуда",
            "items": ["Тарелки", "тарелки", "Бокалы"],
            "tip": "Каждую тарелку в бумагу",
        },
        {"label": "Пустая", "items": []},
    ]
}


@pytest.fixture()
def provider(monkeypatch):
    settings = Settings(
        ai_api_key="test-server-secret",
        ai_base_url="https://model.example/v1",
        ai_model="vision-model",
    )
    app.dependency_overrides[get_settings] = lambda: settings
    original_client = httpx.Client
    calls = []

    def install(content):
        def handle(request):
            calls.append(json.loads(request.content))
            body = content if isinstance(content, str) else json.dumps(content)
            return httpx.Response(200, json={"choices": [{"message": {"content": body}}]})

        monkeypatch.setattr(
            planner.httpx,
            "Client",
            lambda **kwargs: original_client(transport=httpx.MockTransport(handle), **kwargs),
        )

    install(INVENTORY)
    yield install, calls
    app.dependency_overrides.pop(get_settings, None)


def test_box_inventory_is_a_draft_with_image_sent_to_model(client, base, provider):
    _, calls = provider
    box = make_box(client, base)
    r = client.post(
        f"{base}/boxes/{box['number']}/photo-inventory", json={"image": IMAGE, "consent": True}
    )
    assert r.status_code == 200, r.text
    names = [i["name"] for i in r.json()["items"]]
    assert names == ["Электрический чайник", "Кружки (4 шт)"]  # повтор модели убран
    sent = calls[0]
    assert sent["model"] == "vision-model"
    image_part = sent["messages"][1]["content"][1]
    assert image_part == {"type": "image_url", "image_url": {"url": IMAGE}}
    # черновик: в коробке по-прежнему только вещи, которые были
    items = client.get(f"{base}/boxes/{box['number']}").json()["items"]
    assert [i["name"] for i in items] == ["Чайник", "Кружки"]


def test_room_plan_drops_empty_boxes_and_duplicates(client, base, provider):
    install, calls = provider
    install(ROOM)
    r = client.post(f"{base}/room-plan", json={"image": IMAGE, "room": "Кухня", "consent": True})
    assert r.status_code == 200, r.text
    assert r.json() == {
        "room": "Кухня",
        "boxes": [
            {"label": "Посуда", "items": ["Тарелки", "Бокалы"], "tip": "Каждую тарелку в бумагу"}
        ],
    }
    assert "Кухня" in calls[0]["messages"][1]["content"][0]["text"]
    assert client.get(f"{base}/boxes").json()["total"] == 0  # коробки не созданы


@pytest.mark.parametrize(
    "body",
    [
        {"image": IMAGE},  # нет согласия
        {"image": IMAGE, "consent": False},
        {"image": "data:image/gif;base64,R0lGODlhAQABAAAAACw=", "consent": True},  # не тот формат
        {"image": "data:image/jpeg;base64,не-base64!!!!!!!!!!!!!!", "consent": True},
        {"image": "https://example.com/photo.jpg", "consent": True},  # ссылку модели не передаём
    ],
)
def test_bad_request_never_calls_model_or_spends_limit(client, base, provider, body):
    _, calls = provider
    box = make_box(client, base)
    r = client.post(f"{base}/boxes/{box['number']}/photo-inventory", json=body)
    assert r.status_code == 422
    assert calls == []
    # лимит не потрачен: следующий нормальный запрос проходит
    ok = client.post(
        f"{base}/boxes/{box['number']}/photo-inventory", json={"image": IMAGE, "consent": True}
    )
    assert ok.status_code == 200


def test_oversized_image_rejected_before_model(client, base, provider):
    _, calls = provider
    box = make_box(client, base)
    huge = "data:image/jpeg;base64," + "A" * (4 * 1024 * 1024)
    r = client.post(
        f"{base}/boxes/{box['number']}/photo-inventory", json={"image": huge, "consent": True}
    )
    assert r.status_code == 422
    assert calls == []


def test_other_users_project_and_missing_box_are_404_without_model_call(
    client, base, provider, make_client
):
    _, calls = provider
    stranger = make_client("stranger")
    assert (
        stranger.post(
            f"{base}/room-plan", json={"image": IMAGE, "room": "Кухня", "consent": True}
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"{base}/boxes/999/photo-inventory", json={"image": IMAGE, "consent": True}
        ).status_code
        == 404
    )
    assert calls == []


def test_invalid_model_output_is_502(client, base, provider):
    install, _ = provider
    install("это не JSON")
    box = make_box(client, base)
    r = client.post(
        f"{base}/boxes/{box['number']}/photo-inventory", json={"image": IMAGE, "consent": True}
    )
    assert r.status_code == 502
    assert r.json()["code"] == "planner_invalid_response"


def test_unconfigured_ai_is_503(client, base):
    app.dependency_overrides[get_settings] = lambda: Settings(
        ai_api_key="", ai_base_url="", ai_model=""
    )
    try:
        r = client.post(
            f"{base}/room-plan", json={"image": IMAGE, "room": "Кухня", "consent": True}
        )
    finally:
        app.dependency_overrides.pop(get_settings, None)
    assert r.status_code == 503


def test_photo_shares_hourly_limit_with_ai_plan(client, base, provider):
    app.dependency_overrides[get_settings] = lambda: Settings(
        ai_api_key="k", ai_base_url="https://model.example/v1", ai_model="m", ai_requests_per_hour=1
    )
    box = make_box(client, base)
    url = f"{base}/boxes/{box['number']}/photo-inventory"
    assert client.post(url, json={"image": IMAGE, "consent": True}).status_code == 200
    assert client.post(url, json={"image": IMAGE, "consent": True}).status_code == 429


def test_photos_use_the_vision_model_when_set(client, base, provider):
    _, calls = provider
    box = make_box(client, base)
    url = f"{base}/boxes/{box['number']}/photo-inventory"
    # без AI_VISION_MODEL фото идут в основную модель
    assert client.post(url, json={"image": IMAGE, "consent": True}).status_code == 200
    assert calls[-1]["model"] == "vision-model"
    app.dependency_overrides[get_settings] = lambda: Settings(
        ai_api_key="test-server-secret",
        ai_base_url="https://model.example/v1",
        ai_model="text-model",
        ai_vision_model="photo-model",
    )
    assert client.post(url, json={"image": IMAGE, "consent": True}).status_code == 200
    assert calls[-1]["model"] == "photo-model"
    # текстовые запросы (вопросы и план) остаются на основной модели
    client.post(
        "/api/projects/plan-questions",
        json={
            "description": "Переезжаем с кошкой в другой город",
            "move_date": "2026-11-01",
            "consent": True,
        },
    )
    assert calls[-1]["model"] == "text-model"


def test_vision_model_can_use_its_own_spirit_key(client, base, provider, monkeypatch):
    """Два аккаунта Spirit: старый ключ - основная модель (план), новый - вторая модель (фото)."""
    headers = []

    def capture(**kwargs):
        def handle(request):
            headers.append((json.loads(request.content)["model"], request.headers["authorization"]))
            body = INVENTORY if "image_url" in request.content.decode() else {"questions": []}
            return httpx.Response(
                200, json={"choices": [{"message": {"content": json.dumps(body)}}]}
            )

        return REAL_CLIENT(transport=httpx.MockTransport(handle), **kwargs)

    monkeypatch.setattr(planner.httpx, "Client", capture)
    app.dependency_overrides[get_settings] = lambda: Settings(
        ai_api_key="old-haiku-key",
        ai_base_url="https://model.example/v1",
        ai_model="haiku",
        ai_vision_model="sonnet",
        ai_vision_api_key="new-sonnet-key",
    )
    box = make_box(client, base)
    assert (
        client.post(
            f"{base}/boxes/{box['number']}/photo-inventory", json={"image": IMAGE, "consent": True}
        ).status_code
        == 200
    )
    client.post(
        "/api/projects/plan-questions",
        json={
            "description": "Переезжаем с кошкой в другой город",
            "move_date": "2026-11-01",
            "consent": True,
        },
    )
    assert headers == [("sonnet", "Bearer new-sonnet-key"), ("haiku", "Bearer old-haiku-key")]
