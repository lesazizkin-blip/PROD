"""Бюджет переезда «план–факт»: статьи расходов проекта."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import NotFoundError
from app.models import Expense
from app.schemas import BudgetOut, ExpenseIn, ExpenseOut, ExpenseUpdate
from app.services.events import log_event


class BudgetService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _get(self, project_id: uuid.UUID, expense_id: int) -> Expense:
        expense = self.db.scalar(
            select(Expense).where(Expense.id == expense_id, Expense.project_id == project_id)
        )
        if expense is None:
            raise NotFoundError("Статья бюджета не найдена")
        return expense

    def budget(self, project_id: uuid.UUID) -> BudgetOut:
        rows = list(
            self.db.scalars(
                select(Expense).where(Expense.project_id == project_id).order_by(Expense.id)
            )
        )
        with_actual = [e for e in rows if e.actual is not None]
        return BudgetOut(
            items=[ExpenseOut.model_validate(e) for e in rows],
            planned=sum(e.planned for e in rows),
            actual=sum(e.actual or 0 for e in rows),
            variance=sum((e.actual or 0) - e.planned for e in with_actual),
        )

    def add(self, project_id: uuid.UUID, body: ExpenseIn) -> ExpenseOut:
        expense = Expense(project_id=project_id, **body.model_dump())
        self.db.add(expense)
        self.db.flush()
        log_event(
            self.db,
            project_id,
            "expense.created",
            "expense",
            expense.id,
            category=body.category,
            title=expense.title,
            planned=expense.planned,
        )
        self.db.commit()
        return ExpenseOut.model_validate(expense)

    def update(self, project_id: uuid.UUID, expense_id: int, body: ExpenseUpdate) -> ExpenseOut:
        expense = self._get(project_id, expense_id)
        for field, value in body.model_dump(exclude_unset=True).items():
            if field in ("category", "title", "planned") and value is None:
                continue  # обязательные поля не обнуляются; actual=None - «факт ещё неизвестен»
            setattr(expense, field, value)
        self.db.commit()
        return ExpenseOut.model_validate(expense)

    def delete(self, project_id: uuid.UUID, expense_id: int) -> None:
        expense = self._get(project_id, expense_id)
        self.db.delete(expense)
        log_event(
            self.db, project_id, "expense.deleted", "expense", expense_id, title=expense.title
        )
        self.db.commit()
