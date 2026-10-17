from typing import Annotated

from fastapi import Path, Query

from app.errors import ValidationFailed


def confirm_param(
    confirm: bool = Query(default=False, description="Подтверждение удаления: confirm=true"),
) -> None:
    if not confirm:
        raise ValidationFailed("Удаление нужно подтвердить: добавьте confirm=true")


# id и номера в адресе: не больше 2^31-1 (столбцы INTEGER). Больше - 422 сразу, а не ошибка базы (500 на PostgreSQL)
MAX_INT = 2_147_483_647
Id = Annotated[int, Path(le=MAX_INT)]
