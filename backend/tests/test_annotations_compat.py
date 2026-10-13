"""Защита от ошибки, видимой только на Python < 3.14: метод `list` внутри класса затеняет
встроенный `list`, и аннотация `list[X]` падает при определении класса (в 3.14 аннотации ленивые)."""

import importlib
import inspect
import pkgutil
import sys

import pytest

import app


@pytest.mark.skipif(
    sys.version_info < (3, 14), reason="проверка нужна только там, где аннотации ленивые"
)
def test_annotations_evaluate_eagerly_like_older_pythons():
    import annotationlib

    bad = []
    for m in pkgutil.walk_packages(app.__path__, "app."):
        mod = importlib.import_module(m.name)
        for _, obj in inspect.getmembers(mod):
            if getattr(obj, "__module__", None) != mod.__name__:
                continue
            if not (inspect.isclass(obj) or inspect.isfunction(obj)):
                continue  # экземпляры (например, login_limiter) аннотаций не имеют
            targets = [obj]
            if inspect.isclass(obj):
                targets += [f for _, f in inspect.getmembers(obj, inspect.isfunction)]
            for t in targets:
                try:
                    annotationlib.get_annotations(t, format=annotationlib.Format.VALUE)
                except Exception as exc:  # noqa: BLE001
                    bad.append(f"{m.name}:{getattr(t, '__qualname__', t)}: {exc!r}")
    assert not bad, "\n".join(bad)
