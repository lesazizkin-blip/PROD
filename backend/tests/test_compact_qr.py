import re

import sqlalchemy as sa
from alembic.config import Config

from alembic import command
from app.models import BoxQrCode
from app.services import qr_codes
from tests.conftest import make_box


def compact(client, base):
    result = client.patch(base, json={"qr_mode": "compact"})
    assert result.status_code == 200, result.text
    return client.get(f"{base}/boxes/1/label").json()["qr_payload"]


def test_mode_switch_keeps_codes_old_links_and_resolve_is_read_only(client, base):
    make_box(client, base)
    assert client.get(base).json()["qr_mode"] == "universal"
    label = client.get(f"{base}/boxes/1/label").json()
    assert label["qr_payload"] is None
    code = compact(client, base)
    assert re.fullmatch(r"MM1:[A-Z2-7]{16}", code)
    before = client.get(f"{base}/events").json()["total"]
    for _ in range(2):
        result = client.post("/api/boxes/resolve-code", json={"code": f" {code} "})
        assert result.status_code == 200
        assert result.json() == {"project_id": base.split("/")[-1], "box_number": 1}
    assert client.get(f"{base}/events").json()["total"] == before
    assert client.get(f"{base}/boxes/1").json()["status"] == "packing"
    assert client.get(f"{base}/labels").json()[0]["qr_payload"] == code
    assert client.patch(base, json={"qr_mode": "universal"}).status_code == 200
    assert client.get(f"{base}/boxes/1/label").json()["qr_path"] == label["qr_path"]
    assert compact(client, base) == code


def test_resolver_membership_unknown_deleted_and_number_reuse(
    client, base, make_client, db_session
):
    make_box(client, base)
    code = compact(client, base)
    anon = make_client()
    outsider = make_client("outsider")
    member = make_client("helper")
    endpoint = "/api/boxes/resolve-code"
    assert anon.post(endpoint, json={"code": code}).status_code == 401
    assert outsider.post(endpoint, json={"code": code}).status_code == 404
    assert client.post(endpoint, json={"code": "MM1:AAAAAAAAAAAAAAAA"}).status_code == 404
    token = client.post(f"{base}/invites").json()["token"]
    assert member.post(f"/api/invites/{token}/accept").status_code == 200
    assert member.post(endpoint, json={"code": code}).status_code == 200
    assert member.patch(base, json={"qr_mode": "universal"}).status_code == 403
    assert member.patch(base, json={"name": "Общий переезд"}).status_code == 200
    client.delete(f"{base}/boxes/1?confirm=true")
    assert client.post(endpoint, json={"code": code}).status_code == 404
    db_session.expire_all()
    assert db_session.get(BoxQrCode, code).box_id is None
    assert make_box(client, base)["number"] == 2  # номер удалённой коробки не выдаётся снова
    new = client.get(f"{base}/boxes/2/label").json()["qr_payload"]
    assert new != code
    assert client.post(endpoint, json={"code": code}).status_code == 404


def test_invalid_modes_codes_and_retry_collision(client, base, monkeypatch):
    make_box(client, base)
    code = compact(client, base)
    for value in [None, "dense", "", 1]:
        assert client.patch(base, json={"qr_mode": value}).status_code == 422
    for value in ["MM1:abcdefgh234567ab", "MM1:ABCDEFGH234567A0", "1", "MM1:AAAA", None]:
        assert client.post("/api/boxes/resolve-code", json={"code": value}).status_code == 422
    fresh = "MM1:ZZZZZZZZZZZZZZZZ"
    choices = iter([code, fresh])
    monkeypatch.setattr(qr_codes, "new_code", lambda: next(choices))
    assert make_box(client, base)["number"] == 2
    assert client.get(f"{base}/boxes/2/label").json()["qr_payload"] == fresh
    monkeypatch.setattr(qr_codes, "new_code", lambda: code)
    assert client.post(f"{base}/boxes", json={"room": "Кухня"}).status_code == 409
    assert client.get(f"{base}/boxes").json()["total"] == 2


def test_project_delete_keeps_codes_reserved(client, base, db_session):
    make_box(client, base)
    code = compact(client, base)
    assert client.delete(f"{base}?confirm=true").status_code == 204
    db_session.expire_all()
    assert db_session.get(BoxQrCode, code).box_id is None
    assert client.post("/api/boxes/resolve-code", json={"code": code}).status_code == 404


def test_migration_backfills_existing_boxes_without_changing_links(tmp_path):
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{tmp_path / 'legacy.db'}")
    command.upgrade(cfg, "0003")
    engine = sa.create_engine(cfg.get_main_option("sqlalchemy.url"))
    with engine.begin() as conn:
        conn.execute(
            sa.text(
                "INSERT INTO projects (id,name,move_date,created_at) VALUES (:pid,'Old','2026-11-01','2026-10-17')"
            ),
            {"pid": "1" * 32},
        )
        conn.execute(
            sa.text(
                "INSERT INTO boxes (id,project_id,number,room,status,fill_later,created_at,updated_at) VALUES (1,:pid,7,'Kitchen','packing',0,'2026-10-17','2026-10-17')"
            ),
            {"pid": "1" * 32},
        )
    command.upgrade(cfg, "head")
    with engine.connect() as conn:
        assert conn.execute(sa.text("SELECT number FROM boxes")).scalar() == 7
        assert conn.execute(sa.text("SELECT qr_mode FROM projects")).scalar() == "universal"
        code, box_id = conn.execute(sa.text("SELECT code, box_id FROM box_qr_codes")).one()
        assert box_id == 1 and re.fullmatch(r"MM1:[A-Z2-7]{16}", code)
    engine.dispose()
