"""Демо-данные: python -m app.seed (или SEED_DEMO=true при старте). Идемпотентно.

Демо-аккаунт (логин и пароль из настроек DEMO_USERNAME / DEMO_PASSWORD) - владелец демо-проекта.
Демо-проект с фиксированным id: задачи из шаблонов (часть выполнена), коробки во всех статусах,
вещи, потерянная вещь. Нагрузочный проект на 300 коробок и 3000 вещей: python -m app.seed --load.
"""

import sys
import uuid
from datetime import date, timedelta

from app.config import DEMO_PROJECT_ID, get_settings
from app.db import SessionLocal
from app.models import Project, User
from app.reference_data import ensure_reference_data
from app.schemas import BoxCreate, BoxStatus, ItemStatus, ProjectCreate, TaskUpdate
from app.security import hash_password
from app.services.auth import AuthService
from app.services.boxes import BoxService
from app.services.projects import ProjectService
from app.services.tasks import TaskService

DEMO_ID = DEMO_PROJECT_ID
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
        s = get_settings()
        demo = db.query(User).filter_by(username=s.demo_username).first()
        if demo is None:
            demo = User(username=s.demo_username, password_hash=hash_password(s.demo_password))
            db.add(demo)
            db.commit()
        if db.get(Project, DEMO_ID) is None:
            project = projects.create(
                ProjectCreate(
                    name="Переезд на Лесную", move_date=date.today() + timedelta(days=14)
                ),
                DEMO_ID,
            )
            TaskService(db).apply_templates(project)  # демо показывает план из шаблонов
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
            svc.update_item(project.id, lost.item_id, None, ItemStatus.LOST)
            print(f"Демо-проект: {DEMO_ID}")
        # демо-проект мог появиться раньше аккаунтов: отдаём его демо-аккаунту
        AuthService(db).add_member(DEMO_ID, demo.id, "owner")
        db.commit()
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
        if load and db.get(Project, LOAD_ID) is not None:
            AuthService(db).add_member(LOAD_ID, demo.id, "owner")
            db.commit()


if __name__ == "__main__":
    run(load="--load" in sys.argv)
