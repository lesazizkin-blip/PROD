"""Полный путь переезда: калькулятор (только после входа) и бюджет «план–факт» проекта."""

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, get_project
from app.models import Project, User
from app.routers.common import confirm_param
from app.schemas import (
    BudgetOut,
    CalculatorIn,
    CalculatorOut,
    ExpenseIn,
    ExpenseOut,
    ExpenseUpdate,
)
from app.services.budget import BudgetService
from app.services.calculator import estimate

router = APIRouter(tags=["journey"])


@router.post(
    "/calculator",
    response_model=CalculatorOut,
    summary="Оценка переезда: коробки, машина, грузчики, время, бюджет и сроки (после входа, ничего не сохраняет)",
)
def calculator(body: CalculatorIn, _user: User = Depends(get_current_user)):
    return estimate(body)


@router.get(
    "/projects/{pid}/expenses", response_model=BudgetOut, summary="Бюджет: статьи, план, факт"
)
def budget(project: Project = Depends(get_project), db: Session = Depends(get_db)):
    return BudgetService(db).budget(project.id)


@router.post(
    "/projects/{pid}/expenses",
    response_model=ExpenseOut,
    status_code=201,
    summary="Добавить статью",
)
def add_expense(
    body: ExpenseIn, project: Project = Depends(get_project), db: Session = Depends(get_db)
):
    return BudgetService(db).add(project.id, body)


@router.patch(
    "/projects/{pid}/expenses/{expense_id}",
    response_model=ExpenseOut,
    summary="Изменить статью или внести факт",
)
def update_expense(
    expense_id: int,
    body: ExpenseUpdate,
    project: Project = Depends(get_project),
    db: Session = Depends(get_db),
):
    return BudgetService(db).update(project.id, expense_id, body)


@router.delete(
    "/projects/{pid}/expenses/{expense_id}",
    status_code=204,
    dependencies=[Depends(confirm_param)],
    summary="Удалить статью (?confirm=true)",
)
def delete_expense(
    expense_id: int, project: Project = Depends(get_project), db: Session = Depends(get_db)
):
    BudgetService(db).delete(project.id, expense_id)
    return Response(status_code=204)
