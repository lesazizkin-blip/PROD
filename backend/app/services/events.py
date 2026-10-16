import uuid

from sqlalchemy.orm import Session

from app.models import Event


def log_event(
    db: Session, project_id: uuid.UUID, type_: str, entity: str, entity_id: object, **data: object
) -> None:
    """Запись в журнал событий. Коммитит вызывающий: событие и изменение живут в одной транзакции."""
    db.add(
        Event(project_id=project_id, type=type_, entity=entity, entity_id=str(entity_id), data=data)
    )
