"""Отдача собранного сайта (frontend/dist) самим бэкендом: один процесс, без nginx и Node.
Включается переменной STATIC_DIR=<папка со сборкой>. В Docker сайт по-прежнему отдаёт nginx."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles


def mount_site(app: FastAPI, directory: str) -> bool:
    """Подключает сайт. Вызывать после регистрации маршрутов API: пути, которых нет в API,
    отдают index.html (SPA), а /api/... без маршрута остаётся честным 404 в формате API."""
    root = Path(directory).resolve()
    index = root / "index.html"
    if not index.is_file():
        return False
    if (root / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=root / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def site(path: str):
        if path == "api" or path.startswith("api/"):
            return JSONResponse(
                status_code=404, content={"detail": "Не найдено", "code": "not_found"}
            )
        candidate = (root / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(root):  # защита от ../
            return FileResponse(candidate)
        return FileResponse(
            index, headers={"Cache-Control": "no-cache"}
        )  # маршруты сайта, в том числе из QR

    return True
