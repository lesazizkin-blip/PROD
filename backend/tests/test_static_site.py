from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.static_site import mount_site


def make_app(tmp_path):
    site = tmp_path / "site"
    (site / "assets").mkdir(parents=True)
    (site / "index.html").write_text("<html>INDEX</html>")
    (site / "assets" / "app.js").write_text("console.log(1)")
    (site / "favicon.svg").write_text("<svg/>")
    (tmp_path / "secret.txt").write_text("SECRET")  # рядом с сайтом, но вне его папки
    app = FastAPI()

    @app.get("/api/ping")
    def ping():
        return {"pong": True}

    assert mount_site(app, str(site))
    return TestClient(app)


def test_root_and_spa_routes_return_index(tmp_path):
    c = make_app(tmp_path)
    for path in [
        "/",
        "/boxes",
        "/projects/00000000-0000-4000-8000-000000000001/boxes/3",
    ]:  # последний - ссылка из QR
        r = c.get(path)
        assert r.status_code == 200 and "INDEX" in r.text, path
    assert c.get("/").headers["cache-control"] == "no-cache"


def test_static_files_are_served(tmp_path):
    c = make_app(tmp_path)
    assert c.get("/assets/app.js").text == "console.log(1)"
    assert c.get("/favicon.svg").text == "<svg/>"
    assert c.get("/assets/missing.js").status_code == 404


def test_api_wins_and_unknown_api_path_stays_404_json(tmp_path):
    c = make_app(tmp_path)
    assert c.get("/api/ping").json() == {"pong": True}
    r = c.get("/api/nope")
    assert r.status_code == 404 and r.json()["code"] == "not_found"
    assert c.get("/api").status_code == 404


def test_path_traversal_does_not_leak_files(tmp_path):
    c = make_app(tmp_path)
    for path in ["/%2e%2e/secret.txt", "/..%2fsecret.txt", "/assets/%2e%2e/%2e%2e/secret.txt"]:
        r = c.get(path)
        assert "SECRET" not in r.text, path


def test_without_index_nothing_is_mounted(tmp_path):
    (tmp_path / "empty").mkdir()
    assert mount_site(FastAPI(), str(tmp_path / "empty")) is False
