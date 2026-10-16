"""Демо-данные: python -m app.seed (или SEED_DEMO=true при старте). Идемпотентно.

Демо-проект с фиксированным id: задачи из шаблонов (часть выполнена), коробки во всех статусах,
вещи, потерянная вещь. Нагрузочный проект на 300 коробок и 3000 вещей: python -m app.seed --load.
"""

import sys
import uuid
from datetime import date, timedelta

from app.db import SessionLocal
from app.models import Project
from app.reference_data import ensure_reference_data
from app.schemas import BoxCreate, BoxStatus, ProjectCreate, TaskUpdate
from app.services.boxes import BoxService
from app.services.projects import ProjectService
from app.services.tasks import TaskService

DEMO_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")
LOAD_ID = uuid.UUID("00000000-0000-4000-8000-000000000002")

# (комната, статус, вещи)
DEMO_BOXES = [
    ("Кухня", "unpacked", "Чайник\nКружки (4 шт)\nТостер"),
    ("Кухня", "delivered", "Тарелки\nСковородки\nСпеции"),
    ("Кухня", "loaded", "Кофемашина\nМикроволновка"),
    ("Кухня", "packed", "Ножи\nДоска разделочная"),
    ("Кухня", "packing", "Полотенца кухонные"),
    ("Гостиная", "delivered", "Книги\nНастольные игры\nПульт от телевизора"),
    ("Гостиная", "loaded", "Плед\nПодушки"),
    ("Гостиная", "packed", "Зарядка для ноутбука\nУдлинитель"),
    ("Спальня", "unpacked", "Постельное бельё\nПодушка"),
    ("Спальня", "delivered", "Зимняя одежда\nОбувь"),
    ("Спальня", "packing", "Будильник\nЗарядки для телефонов"),
    ("Ванная", "packed", "Зубные щётки\nПолотенца\nШампунь"),
    ("Кабинет", "loaded", "Документы\nПринтер"),
    ("Детская", "packing", "Игрушки\nКонструктор"),
]

STATUS_PATH = ["packed", "loaded", "delivered", "unpacked"]


def _advance(svc: BoxService, pid: uuid.UUID, number: int, target: str) -> None:
    for step in STATUS_PATH:
        if target == "packing":
            return
        svc.transition(pid, number, BoxStatus(step))
        if step == target:
            return


def run(load: bool = False) -> None:
    with SessionLocal() as db:
        ensure_reference_data(db)
        projects = ProjectService(db)
        if db.get(Project, DEMO_ID) is None:
            project = projects.create(
                ProjectCreate(
                    name="Переезд на Лесную", move_date=date.today() + timedelta(days=14)
                ),
                DEMO_ID,
            )
            tasks = TaskService(db).list_tasks(project.id, None, None)
            for t in tasks[:4]:
                TaskService(db).update(project.id, t.id, TaskUpdate(done=True))
            svc = BoxService(db)
            for room, status, items in DEMO_BOXES:
                box = svc.create(project.id, BoxCreate(room=room, items_text=items))
                _advance(svc, project.id, box.number, status)
            svc.create(
                project.id, BoxCreate(room="Кабинет", fill_later=True)
            )  # покажет напоминание об описи
            lost = svc.search(project.id, "Зарядки", 0, 1)[0][0]
            svc.update_item(project.id, lost.item_id, None, True)
            print(f"Демо-проект: {DEMO_ID}")
        if load and db.get(Project, LOAD_ID) is None:
            project = projects.create(
                ProjectCreate(
                    name="Нагрузочный проект", move_date=date.today() + timedelta(days=30)
                ),
                LOAD_ID,
            )
            svc = BoxService(db)
            rooms = [
                "Кухня",
                "Гостиная",
                "Спальня",
                "Ванная",
                "Кабинет",
                "Детская",
                "Коридор",
                "Балкон",
            ]
            for i in range(300):
                names = "\n".join(f"Вещь {i}-{j}" for j in range(10))
                svc.create(project.id, BoxCreate(room=rooms[i % len(rooms)], items_text=names))
            print(f"Нагрузочный проект: {LOAD_ID} (300 коробок, 3000 вещей)")


if __name__ == "__main__":
    run(load="--load" in sys.argv)
