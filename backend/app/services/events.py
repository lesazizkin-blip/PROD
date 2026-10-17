import uuid

from sqlalchemy.orm import Session

from app.logging_setup import audit
from app.models import Event


def log_event(
    db: Session, project_id: uuid.UUID, type_: str, entity: str, entity_id: object, **data: object
) -> None:
    """Запись в журнал событий. Коммитит вызывающий: событие и изменение живут в одной транзакции."""
    db.add(
        Event(project_id=project_id, type=type_, entity=entity, entity_id=str(entity_id), data=data)
    )
    # то же событие - в лог (без названий, которые ввёл пользователь)
    audit(type_, project_id=project_id, entity=entity, entity_id=str(entity_id), **data)
