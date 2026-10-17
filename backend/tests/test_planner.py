import json

import httpx
import pytest
from sqlalchemy import func, select

from app.config import Settings, get_settings
from app.main import app
from app.models import Project
from app.reference_data import FIRST_DAY, TASK_TEMPLATES
from app.services import planner

BODY = {
    "description": "Переезжаем с кошкой и ребёнком в другой город",
    "move_date": "2026-11-01",
    "consent": True,
}
PLAN = {
    "tasks": [
        {"title": "Подготовить переноску для кошки", "stage": "before", "offset_days": -2},
        {"title": "Устроить кошке тихое место", "stage": "after", "offset_days": 1},
    ],
    "first_day": ["Корм для кошки"],
}


@pytest.fixture(autouse=True)
def reset_limiter():
    planner.limiter.windows.clear()


@pytest.fixture()
def provider(monkeypatch):
    settings = Settings(
        ai_api_key="test-server-secret",
        ai_base_url="https://model.example/v1",
        ai_model="test-model",
    )
    app.dependency_overrides[get_settings] = lambda: settings
    original_client = httpx.Client
    calls = []

    def install(content=PLAN, status=200, error=None, envelope=None):
        def handle(request):
            calls.append(request)
            if error:
                raise error
            return httpx.Response(
                status,
                json=envelope
                if envelope is not None
                else {
                    "choices": [
                        {
                            "message": {
                                "content": json.dumps(content)
                                if not isinstance(content, str)
                                else content
                            }
                        }
                    ],
                },
            )

        monkeypatch.setattr(
            planner.httpx,
            "Client",
            lambda **kwargs: original_client(
                transport=httpx.MockTransport(handle),
                **kwargs,
            ),
        )

    install()
    yield install, calls, settings
    app.dependency_overrides.pop(get_settings, None)


def test_preview_requires_login_and_explicit_consent(anon_client, provider):
    assert anon_client.post("/api/projects/plan-preview", json=BODY).status_code == 401
    assert not provider[1]


@pytest.mark.parametrize(
    "changes",
    [
        {"consent": False},
        {"description": " " * 20},
        {"description": "x" * 4001},
        {"move_date": "bad"},
    ],
)
def test_invalid_request_never_calls_provider(client, provider, changes):
    assert client.post("/api/projects/plan-preview", json={**BODY, **changes}).status_code == 422
    assert not provider[1]


def test_missing_consent(client, provider):
    assert (
        client.post(
            "/api/projects/plan-preview", json={k: v for k, v in BODY.items() if k != "consent"}
        ).status_code
        == 422
    )
    assert not provider[1]


def test_preview_is_private_draft_not_database_mutation(client, provider, db_session):
    response = client.post(
        "/api/projects/plan-preview",
        json={**BODY, "address_to": "PRIVATE ADDRESS", "name": "PRIVATE NAME"},
    )
    assert response.status_code == 200, response.text
    assert response.json() == PLAN
    assert db_session.scalar(select(func.count(Project.id))) == 0
    request = provider[1][0]
    assert str(request.url) == "https://model.example/v1/chat/completions"
    assert request.headers["authorization"] == "Bearer test-server-secret"
    payload = json.loads(request.content)
    assert json.loads(payload["messages"][1]["content"]) == {
        "move_date": BODY["move_date"],
        "description": BODY["description"],
    }
    assert "PRIVATE" not in request.content.decode()
    assert "test-server-secret" not in response.text


@pytest.mark.parametrize(
    "content",
    [
        "not json",
        {"tasks": []},
        {"tasks": [{"title": "x", "stage": "after", "offset_days": -2}]},
        {"tasks": [{"title": "x", "stage": "moving_day", "offset_days": 2}]},
        {"tasks": [{"title": "x", "stage": "before", "offset_days": -999}]},
        {"tasks": [{"title": "x" * 201, "stage": "before", "offset_days": -1}]},
        {"tasks": [{"title": "x", "stage": "before", "offset_days": -1, "sql": "ignored?"}]},
        None,
    ],
)
def test_invalid_model_output(client, provider, content):
    provider[0](content=content)
    response = client.post("/api/projects/plan-preview", json=BODY)
    assert response.status_code == 502
    assert response.json()["code"] == "planner_invalid_response"
    assert client.get("/api/projects").json() == []


def test_empty_provider_envelope(client, provider):
    provider[0](envelope={"choices": []})
    assert client.post("/api/projects/plan-preview", json=BODY).status_code == 502


@pytest.mark.parametrize("status", [401, 429, 500])
def test_provider_failure_does_not_block_standard_creation(client, provider, status):
    provider[0](status=status)
    assert client.post("/api/projects/plan-preview", json=BODY).status_code == 503
    assert (
        client.post(
            "/api/projects", json={"name": "Переезд", "move_date": "2026-11-01"}
        ).status_code
        == 201
    )


def test_provider_timeout(client, provider):
    provider[0](error=httpx.ReadTimeout("do not expose provider details"))
    response = client.post("/api/projects/plan-preview", json=BODY)
    assert response.status_code == 503
    assert "provider details" not in response.text


def test_unconfigured_ai(client):
    app.dependency_overrides[get_settings] = lambda: Settings(
        ai_api_key="", ai_base_url="", ai_model=""
    )
    assert client.post("/api/projects/plan-preview", json=BODY).status_code == 503


def test_limit_and_isolation_between_users(client, provider, make_client):
    provider[2].ai_requests_per_hour = 1
    assert client.post("/api/projects/plan-preview", json=BODY).status_code == 200
    assert client.post("/api/projects/plan-preview", json=BODY).status_code == 429
    other = make_client("other-person")
    assert other.post("/api/projects/plan-preview", json=BODY).status_code == 200
    assert len(provider[1]) == 2


def test_deduplicates_generated_tasks(client, provider):
    provider[0](
        {
            **PLAN,
            "tasks": [
                PLAN["tasks"][0],
                {**PLAN["tasks"][0], "title": "  ПОДГОТОВИТЬ  переноску для кошки "},
            ],
        }
    )
    assert len(client.post("/api/projects/plan-preview", json=BODY).json()["tasks"]) == 1


def test_reviewed_plan_created_with_templates_dates_owner_and_first_day(client, make_client):
    response = client.post(
        "/api/projects",
        json={
            "name": "Семья",
            "move_date": "2026-11-01",
            "personal_plan": {
                "tasks": PLAN["tasks"]
                + [
                    PLAN["tasks"][0],
                    {"title": "Заказать грузчиков", "stage": "before", "offset_days": -1},
                ],
                "first_day": [*PLAN["first_day"], *PLAN["first_day"], FIRST_DAY[0]],
            },
        },
    )
    assert response.status_code == 201, response.text
    base = f"/api/projects/{response.json()['id']}"
    tasks = client.get(f"{base}/tasks").json()
    assert len(tasks) == len(TASK_TEMPLATES) + 2
    assert (
        next(t for t in tasks if t["title"] == PLAN["tasks"][0]["title"])["due_date"]
        == "2026-10-30"
    )
    assert (
        next(t for t in tasks if t["title"] == PLAN["tasks"][1]["title"])["due_date"]
        == "2026-11-02"
    )
    assert len(client.get(f"{base}/first-day").json()) == len(FIRST_DAY) + 1
    assert client.get(f"{base}/members").json()[0]["role"] == "owner"
    assert make_client("outsider").get(f"{base}/tasks").status_code in (403, 404)


def test_invalid_reviewed_plan_creates_nothing(client):
    response = client.post(
        "/api/projects",
        json={
            "name": "Переезд",
            "move_date": "2026-11-01",
            "personal_plan": {"tasks": [{"title": "X", "stage": "before", "offset_days": 3}]},
        },
    )
    assert response.status_code == 422
    assert client.get("/api/projects").json() == []


def test_date_overflow_rejected(client):
    response = client.post(
        "/api/projects",
        json={
            "name": "Переезд",
            "move_date": "9999-12-31",
            "personal_plan": {"tasks": [{"title": "X", "stage": "after", "offset_days": 1}]},
        },
    )
    assert response.status_code == 422
