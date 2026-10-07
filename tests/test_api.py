VALID = {
    "role": "backend",
    "region": "moscow",
    "education": "bachelor",
    "experience_years": 3.5,
    "skills_count": 8,
    "company_size": 200,
    "remote": 1,
}


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["model_loaded"] is True


def test_predict_happy_path(client):
    r = client.post("/predict", json=VALID)
    assert r.status_code == 200
    body = r.json()
    assert body["prediction"] > 0
    assert body["low"] <= body["prediction"] <= body["high"]
    assert body["request_id"]
    assert r.headers["x-request-id"] == body["request_id"]


def test_predict_handles_missing_optional_fields(client):
    r = client.post("/predict", json={"role": "qa", "region": "other"})
    assert r.status_code == 200


def test_experience_improves_prediction(client):
    junior = client.post("/predict", json={**VALID, "experience_years": 0.5}).json()
    senior = client.post("/predict", json={**VALID, "experience_years": 12}).json()
    assert senior["prediction"] > junior["prediction"]


def test_validation_error_unknown_role(client):
    r = client.post("/predict", json={**VALID, "role": "astronaut"})
    assert r.status_code == 422


def test_validation_error_negative_experience(client):
    r = client.post("/predict", json={**VALID, "experience_years": -1})
    assert r.status_code == 422


def test_batch(client):
    r = client.post("/predict/batch", json={"items": [VALID, {**VALID, "role": "qa"}]})
    assert r.status_code == 200
    assert len(r.json()["predictions"]) == 2


def test_batch_empty_rejected(client):
    assert client.post("/predict/batch", json={"items": []}).status_code == 422


def test_metrics_endpoint(client):
    client.post("/predict", json=VALID)
    m = client.get("/metrics").json()
    assert m["requests_total"] >= 1
    assert m["latency_ms"]["p95"] is not None


def test_model_info(client):
    assert "schema" in client.get("/model/info").json()
