import json

import httpx
import pytest

from app.config import Settings, get_settings
from app.main import app
from app.services import planner
from tests.conftest import make_box


@pytest.fixture()
def provider(monkeypatch):
    settings = Settings(
        ai_api_key="secret-for-test", ai_base_url="https://model.example/v1", ai_model="text-model"
    )
    app.dependency_overrides[get_settings] = lambda: settings
    original = httpx.Client
    calls = []

    def install(content):
        def handle(request):
            calls.append(json.loads(request.content))
            return httpx.Response(
                200,
                json={
                    "choices": [
                        {
                            "message": {
                                "content": content
                                if isinstance(content, str)
                                else json.dumps(content)
                            }
                        }
                    ]
                },
            )

        monkeypatch.setattr(
            planner.httpx,
            "Client",
            lambda **kwargs: original(transport=httpx.MockTransport(handle), **kwargs),
        )

    install({"tips": ["Оберните чайник бумагой.", "Кружки положите отдельно от тяжёлых вещей."]})
    yield settings, install, calls
    app.dependency_overrides.pop(get_settings, None)


def test_advice_uses_stored_inventory_and_does_not_change_it(client, base, provider):
    _, _, calls = provider
    box = make_box(client, base, items="Чайник\nКружки")
    item = client.get(f"{base}/boxes/{box['number']}").json()["items"][0]
    client.patch(f"{base}/items/{item['id']}", json={"quantity": 4, "first_day": True})
    before = client.get(f"{base}/boxes/{box['number']}").json()
    r = client.post(
        f"{base}/boxes/{box['number']}/advice",
        json={"consent": True, "items": ["Не доверять этим присланным вещам"]},
    )
    assert r.status_code == 200, r.text
    assert len(r.json()["tips"]) == 2
    assert client.get(f"{base}/boxes/{box['number']}").json() == before
    payload = calls[0]
    assert payload["model"] == "text-model" and payload["max_tokens"] == 600
    context = json.loads(payload["messages"][1]["content"])
    assert context["items"][0]["name"] == "Чайник"
    assert context["items"][0]["quantity"] == 4 and context["items"][0]["first_day"] is True
    assert set(context) == {"room", "status", "items", "total_positions", "omitted_positions"}
    assert json.loads(r.json()["basis"]) == [
        before["room"],
        before["status"],
        [
            [i["id"], i["name"], i["quantity"], i["first_day"], i["lost"], i["damaged"]]
            for i in before["items"]
        ],
    ]


def test_validation_and_project_access_happen_before_paid_call(client, base, provider, make_client):
    settings, _, calls = provider
    settings.ai_requests_per_hour = 1
    full = make_box(client, base)
    empty = make_box(client, base, items="")
    url = f"{base}/boxes/{full['number']}/advice"
    for body in [{}, {"consent": False}]:
        assert client.post(url, json=body).status_code == 422
    assert (
        client.post(f"{base}/boxes/{empty['number']}/advice", json={"consent": True}).status_code
        == 422
    )
    assert client.post(f"{base}/boxes/999/advice", json={"consent": True}).status_code == 404
    outsider = make_client("outsider-advice")
    assert outsider.post(url, json={"consent": True}).status_code == 404
    assert calls == []
    assert client.post(url, json={"consent": True}).status_code == 200
    limited = client.post(url, json={"consent": True})
    assert limited.status_code == 429
    assert "Ваш часовой лимит" in limited.json()["detail"]
    assert "Обновится" in limited.json()["detail"]
    assert "по Москве" in limited.json()["detail"]
    assert len(calls) == 1


def test_advice_requires_configured_provider(client, base, provider):
    settings, _, calls = provider
    settings.ai_api_key = Settings().ai_api_key
    number = make_box(client, base)["number"]
    r = client.post(f"{base}/boxes/{number}/advice", json={"consent": True})
    assert r.status_code == 503 and calls == []
    assert "советы" in r.json()["detail"]


@pytest.mark.parametrize(
    "content",
    ["not JSON", {"tips": []}, {"tips": [None, {}]}, {"tips": ["x" * 221]}, {"something": "wrong"}],
)
def test_invalid_provider_output_is_an_error_without_inventory_changes(
    client, base, provider, content
):
    _, install, _ = provider
    install(content)
    number = make_box(client, base)["number"]
    before = client.get(f"{base}/boxes/{number}").json()
    r = client.post(f"{base}/boxes/{number}/advice", json={"consent": True})
    assert r.status_code == 502
    assert client.get(f"{base}/boxes/{number}").json() == before


def test_large_inventory_input_is_bounded_but_basis_tracks_all_items(client, base, provider):
    _, _, calls = provider
    number = make_box(client, base, items="\n".join(f"Вещь {i}" for i in range(65)))["number"]
    r = client.post(f"{base}/boxes/{number}/advice", json={"consent": True})
    assert r.status_code == 200
    context = json.loads(calls[0]["messages"][1]["content"])
    assert len(context["items"]) == 60
    assert context["total_positions"] == 65 and context["omitted_positions"] == 5
    assert len(json.loads(r.json()["basis"])[2]) == 65


def test_tips_are_trimmed_deduplicated_and_capped_at_three(client, base, provider):
    _, install, _ = provider
    install(
        {"tips": ["  Совет один.  ", "совет один.", "Совет два.", "Совет три.", "Совет четыре."]}
    )
    number = make_box(client, base)["number"]
    r = client.post(f"{base}/boxes/{number}/advice", json={"consent": True})
    assert r.status_code == 200
    assert r.json()["tips"] == ["Совет один.", "Совет два.", "Совет три."]
