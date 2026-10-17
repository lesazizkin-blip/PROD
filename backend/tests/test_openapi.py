"""Swagger: у каждого тела запроса есть пример, жюри может нажать Try it out и сразу отправить."""

from app.main import app


def test_every_request_body_has_an_example():
    spec = app.openapi()
    schemas = spec["components"]["schemas"]
    missing = []
    for path, methods in spec["paths"].items():
        for method, op in methods.items():
            body = op.get("requestBody", {}).get("content", {}).get("application/json")
            if not body:
                continue
            ref = body["schema"].get("$ref", "").split("/")[-1]
            schema = schemas.get(ref, body["schema"])
            fields = schema.get("properties", {}).values()
            if "examples" not in schema and not any("examples" in f for f in fields):
                missing.append(f"{method.upper()} {path} ({ref})")
    assert not missing, missing
