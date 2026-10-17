"""Полный путь переезда: калькулятор (только после входа) и бюджет «план–факт» проекта."""

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, get_project
from app.errors import ValidationFailed
from app.models import CityPrice, Project, User
from app.routers.common import Id, confirm_param
from app.schemas import (
    BudgetOut,
    CalculatorIn,
    CalculatorOut,
    CityOut,
    ExpenseIn,
    ExpenseOut,
    ExpenseUpdate,
)
from app.services.budget import BudgetService
from app.services.calculator import average_rates, city_rates, estimate

router = APIRouter(tags=["journey"])


@router.post(
    "/calculator",
    response_model=CalculatorOut,
    summary="Оценка переезда: коробки, машина, грузчики, время, бюджет и сроки (после входа, ничего не сохраняет)",
)
def calculator(
    body: CalculatorIn,
    _user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    def prices(row: CityPrice):
        movers = (row.mover_low, row.mover_high, row.movers_offers)
        return movers, (row.truck_low, row.truck_high, row.trucks_offers), row.checked_on

    if body.city:
        row = db.get(CityPrice, body.city)
        if row is None:
            raise ValidationFailed("Такого города нет в списке: выберите из GET /api/cities")
        return estimate(body, city_rates(row.name, *prices(row)))
    return estimate(body, average_rates([prices(r) for r in db.query(CityPrice).all()]))


@router.get(
    "/cities",
    response_model=list[CityOut],
    summary="Города с ценами на переезд для калькулятора (по алфавиту)",
)
def cities(db: Session = Depends(get_db)):
    return db.query(CityPrice).order_by(CityPrice.name).all()


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
    expense_id: Id,
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
    expense_id: Id, project: Project = Depends(get_project), db: Session = Depends(get_db)
):
    BudgetService(db).delete(project.id, expense_id)
    return Response(status_code=204)
