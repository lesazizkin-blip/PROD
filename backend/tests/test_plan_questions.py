"""Двухшаговый AI-план: шаг 1 - уточняющие вопросы, шаг 2 - план с ответами. Провайдер подменён."""

import json

from tests.test_planner import BODY, PLAN, provider  # noqa: F401  (фикстура провайдера)

QUESTIONS = {
    "questions": [
        {"id": "q1", "question": "Есть ли грузовой лифт?", "options": ["Да", "Нет", "Да"]},
        {"id": "q2", "question": "есть ли  грузовой лифт?", "options": ["Да"]},
        {"id": "q3", "question": "Нужно разбирать шкафы?", "options": ["Да, два", "Нет"]},
    ]
}


def test_questions_step_requires_consent_and_login(client, make_client, provider):  # noqa: F811
    install, calls, _ = provider
    install(QUESTIONS)
    assert make_client().post("/api/projects/plan-questions", json=BODY).status_code == 401
    no_consent = {**BODY, "consent": False}
    assert client.post("/api/projects/plan-questions", json=no_consent).status_code == 422
    assert calls == []


def test_questions_are_deduplicated_and_sent_without_answers(client, provider):  # noqa: F811
    install, calls, _ = provider
    install(QUESTIONS)
    r = client.post("/api/projects/plan-questions", json=BODY)
    assert r.status_code == 200, r.text
    assert r.json() == {
        "questions": [
            {"id": "q1", "question": "Есть ли грузовой лифт?", "options": ["Да", "Нет"]},
            {"id": "q3", "question": "Нужно разбирать шкафы?", "options": ["Да, два", "Нет"]},
        ]
    }
    sent = json.loads(calls[0].content)
    user = json.loads(sent["messages"][1]["content"])
    assert user == {"move_date": BODY["move_date"], "description": BODY["description"]}
    assert "уточняющих вопросов" in sent["messages"][0]["content"]


def test_answers_reach_the_plan_step(client, provider):  # noqa: F811
    install, calls, _ = provider
    install(PLAN)
    answers = [{"question": "Есть ли грузовой лифт?", "answer": "Нет лифта, 5 этаж"}]
    r = client.post("/api/projects/plan-preview", json={**BODY, "answers": answers})
    assert r.status_code == 200, r.text
    user = json.loads(json.loads(calls[0].content)["messages"][1]["content"])
    assert user["answers"] == answers


def test_plan_without_answers_keeps_the_old_request(client, provider):  # noqa: F811
    _, calls, _ = provider
    assert client.post("/api/projects/plan-preview", json=BODY).status_code == 200
    user = json.loads(json.loads(calls[0].content)["messages"][1]["content"])
    assert "answers" not in user


def test_answers_are_bounded_before_the_model(client, provider):  # noqa: F811
    _, calls, _ = provider
    many = [{"question": f"Вопрос {i}", "answer": "Да"} for i in range(6)]
    long = [{"question": "Вопрос", "answer": "x" * 201}]
    for answers in (many, long):
        r = client.post("/api/projects/plan-preview", json={**BODY, "answers": answers})
        assert r.status_code == 422
    assert calls == []


def test_invalid_questions_from_model_are_502(client, provider):  # noqa: F811
    install, _, _ = provider
    install("не JSON")
    r = client.post("/api/projects/plan-questions", json=BODY)
    assert r.status_code == 502
    assert r.json()["code"] == "planner_invalid_response"


def test_questions_and_plan_share_the_hourly_limit(client, provider):  # noqa: F811
    install, _, settings = provider
    settings.ai_requests_per_hour = 2
    install(QUESTIONS)
    assert client.post("/api/projects/plan-questions", json=BODY).status_code == 200
    install(PLAN)
    assert client.post("/api/projects/plan-preview", json=BODY).status_code == 200
    assert client.post("/api/projects/plan-preview", json=BODY).status_code == 429
