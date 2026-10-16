from fastapi import Query

from app.errors import ValidationFailed


def confirm_param(
    confirm: bool = Query(default=False, description="Подтверждение удаления: confirm=true"),
) -> None:
    if not confirm:
        raise ValidationFailed("Удаление нужно подтвердить: добавьте confirm=true")
