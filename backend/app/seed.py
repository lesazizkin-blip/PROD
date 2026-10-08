"""Демо-данные: python -m app.seed  (администратор + пользователь + пара записей)."""

from app.db import SessionLocal
from app.schemas import Action, ItemCreate, RegisterIn
from app.services.auth import AuthService
from app.services.items import ItemService


def run() -> None:
    with SessionLocal() as db:
        auth = AuthService(db)
        auth.ensure_admin("admin@example.com", "admin12345", "Администратор")
        if auth.users.get_by_email("user@example.com"):
            print("Демо-данные уже есть")
            return
        user, _ = auth.register(
            RegisterIn(email="user@example.com", full_name="Иван Петров", password="user12345")
        )
        admin = auth.users.get_by_email("admin@example.com")
        svc = ItemService(db)
        for title, amount in [
            ("Кэшбэк 10% на кофе", 50000),
            ("Скидка 20% на такси", 120000),
            ("Бонусы за подписку", 8000),
        ]:
            item = svc.create(
                ItemCreate(title=title, description="Демо-запись", amount=amount), user
            )
            if amount >= 50000:
                svc.transition(item.id, Action.SUBMIT, None, user)
        svc.transition(1, Action.APPROVE, None, admin)
        print("Созданы: admin@example.com / admin12345, user@example.com / user12345")


if __name__ == "__main__":
    run()
