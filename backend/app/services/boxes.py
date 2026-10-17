import re
import uuid

from sqlalchemy import Integer, case, cast, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.errors import ConflictError, NotFoundError, ValidationFailed
from app.models import Box, Event, Item, Project
from app.schemas import (
    BoxCardOut,
    BoxCreate,
    BoxOut,
    BoxStatus,
    BoxUpdate,
    ItemOut,
    ItemStatus,
    LabelOut,
    ProgressOut,
    RoomProgress,
    SearchHit,
)
from app.services.events import log_event
from app.services.qr_codes import assign_code

ORDER = [s.value for s in BoxStatus]

# Вперёд - только на следующий этап (этапы не перескакивают); назад - на любой более ранний этап
# свободно и без причины (решение владельца 18.10: ошибочную отметку исправляют одним нажатием)
TRANSITIONS: dict[str, frozenset[str]] = {
    status: frozenset(ORDER[i + 1 : i + 2]) | frozenset(ORDER[:i]) for i, status in enumerate(ORDER)
}

STATUS_RU = {
    "packing": "Собирается",
    "packed": "Собрана",
    "loaded": "Погружена",
    "delivered": "Доставлена",
    "unpacked": "Распакована",
}

MAX_BULK_LINES = 200
MAX_NAME = 120


def check_transition(current: str, target: str) -> None:
    """Чистая функция: бросает ConflictError, если переход не из таблицы TRANSITIONS."""
    if current == target:
        raise ConflictError(f"Коробка уже в статусе «{STATUS_RU.get(current, current)}»")
    if target not in TRANSITIONS.get(current, frozenset()):
        raise ConflictError(
            "Вперёд этапы идут по порядку: сначала отметьте "
            f"«{STATUS_RU[ORDER[ORDER.index(current) + 1]]}». Назад можно вернуть на любой этап."
        )


def lock_project(db, project_id) -> None:
    """Блокировка проекта до конца транзакции (номера коробок, шаблоны, умный чек-лист)."""
    db.execute(update(Project).where(Project.id == project_id).values(name=Project.name))


def normalize(text: str) -> str:
    """Для поиска: без регистра, ё = е, лишние пробелы схлопнуты."""
    # lower() у редких букв удлиняет строку («İ» -> 2 символа), а name_norm - не длиннее 120
    return re.sub(r"\s+", " ", text.strip().lower().replace("ё", "е"))[:120]


_ENDING = re.compile(r"[аяыиуюеоьй]{1,2}$")


def search_stem(needle: str) -> str:
    """Основа последнего слова запроса без окончания: «зарядки», «зарядку» -> «зарядк».
    Только для слов от 5 букв, основа не короче 4: короткие запросы ищутся как есть."""
    head, _, last = needle.rpartition(" ")
    stem = _ENDING.sub("", last) if len(last) >= 5 else last
    if len(stem) < 4:
        stem = last
    return f"{head} {stem}" if head else stem


def parse_lines(text: str) -> list[str]:
    names = [line.strip() for line in text.splitlines() if line.strip()]
    if len(names) > MAX_BULK_LINES:
        raise ValidationFailed(f"За один раз можно добавить не больше {MAX_BULK_LINES} вещей")
    for n in names:
        if len(n) > MAX_NAME:
            raise ValidationFailed(f"Название вещи длиннее {MAX_NAME} символов: «{n[:30]}…»")
    return names


def _box_out(box: Box, count: int) -> BoxOut:
    return BoxOut(
        number=box.number,
        project_id=box.project_id,
        room=box.room,
        status=box.status,  # type: ignore[arg-type]
        fill_later=box.fill_later,
        remind_at=box.remind_at,
        items_count=count,
        created_at=box.created_at,
        updated_at=box.updated_at,
    )


def _item_out(item: Item, box_number: int) -> ItemOut:
    return ItemOut(
        id=item.id,
        box_number=box_number,
        name=item.name,
        status=item.status,  # type: ignore[arg-type]
        lost=item.status == ItemStatus.LOST,
        damaged=item.damaged,
        first_day=item.first_day,
        created_at=item.created_at,
    )


class BoxService:
    def __init__(self, db: Session) -> None:
        self.db = db

    # --- чтение ---
    def _count(self, box_id: int) -> int:
        return self.db.scalar(select(func.count(Item.id)).where(Item.box_id == box_id)) or 0

    def get_box(self, project_id: uuid.UUID, number: int, lock: bool = False) -> Box:
        q = select(Box).where(Box.project_id == project_id, Box.number == number)
        if lock:
            q = q.with_for_update()
        box = self.db.scalar(q)
        if not box:
            raise NotFoundError("Коробка не найдена")
        return box

    def box_out(self, box: Box) -> BoxOut:
        return _box_out(box, self._count(box.id))

    def card(self, project_id: uuid.UUID, number: int) -> BoxCardOut:
        box = self.get_box(project_id, number)
        base = self.box_out(box)
        return BoxCardOut(**base.model_dump(), items=[_item_out(i, box.number) for i in box.items])

    def list_boxes(
        self,
        project_id: uuid.UUID,
        *,
        room: str | None,
        status: BoxStatus | None,
        fill_later: bool | None,
        number: int | None,
        offset: int,
        limit: int,
    ) -> tuple[list[BoxOut], int]:
        where = [Box.project_id == project_id]
        if room:
            where.append(Box.room == room.strip())
        if status:
            where.append(Box.status == status.value)
        if fill_later is not None:
            where.append(Box.fill_later.is_(fill_later))
        if number is not None:
            where.append(Box.number == number)
        total = self.db.scalar(select(func.count(Box.id)).where(*where)) or 0
        rows = self.db.execute(
            select(Box, func.count(Item.id))
            .outerjoin(Item, Item.box_id == Box.id)
            .where(*where)
            .group_by(Box.id)
            .order_by(Box.number)
            .offset(offset)
            .limit(limit)
        ).all()
        return [_box_out(b, c) for b, c in rows], total

    # --- запись ---
    def _next_number(self, project_id: uuid.UUID) -> int:
        # блокировка проекта: параллельные запросы получают номера по очереди. Пустой UPDATE открывает
        # пишущую транзакцию и на SQLite (FOR UPDATE там ничего не делает), на PostgreSQL блокирует строку
        lock_project(self.db, project_id)
        # номер удалённой коробки не выдаётся снова: на старой наклейке он открыл бы чужую коробку.
        # Все выданные номера есть в журнале (box.created), поэтому берём максимум и оттуда
        current = self.db.scalar(select(func.max(Box.number)).where(Box.project_id == project_id))
        issued = self.db.scalar(
            select(func.max(cast(Event.entity_id, Integer))).where(
                Event.project_id == project_id, Event.type == "box.created"
            )
        )
        return max(current or 0, issued or 0) + 1

    def create(self, project_id: uuid.UUID, data: BoxCreate) -> BoxOut:
        names = parse_lines(data.items_text or "")
        for attempt in range(3):
            box = Box(
                project_id=project_id,
                number=self._next_number(project_id),
                room=data.room,
                fill_later=data.fill_later,
                remind_at=data.remind_at,
            )
            self.db.add(box)
            try:
                self.db.flush()
            except IntegrityError:
                # другой запрос занял этот номер: UNIQUE(project_id, number) не даёт создать дубль
                self.db.rollback()
                if attempt == 2:
                    raise ConflictError(
                        "Не удалось выдать номер коробки, повторите запрос"
                    ) from None
                continue
            break
        assign_code(self.db, box)
        for name in names:
            self.db.add(Item(box_id=box.id, name=name, name_norm=normalize(name)))
        log_event(self.db, project_id, "box.created", "box", box.number, room=box.room)
        self.db.commit()
        return self.box_out(box)

    def update(self, project_id: uuid.UUID, number: int, data: BoxUpdate) -> BoxOut:
        box = self.get_box(project_id, number)
        for field, value in data.model_dump(exclude_unset=True).items():
            if field in ("room", "fill_later") and value is None:
                raise ValidationFailed(f"Поле {field} нельзя очистить")
            setattr(box, field, value)
        self.db.commit()
        return self.box_out(box)

    def delete(self, project_id: uuid.UUID, number: int) -> None:
        box = self.get_box(project_id, number)
        log_event(self.db, project_id, "box.deleted", "box", box.number, room=box.room)
        self.db.delete(box)
        self.db.commit()

    def transition(self, project_id: uuid.UUID, number: int, target: BoxStatus) -> BoxOut:
        box = self.get_box(
            project_id, number, lock=True
        )  # две отметки одной коробки идут по очереди
        self._check_move(box, target)
        self._set_status(box, target)
        self.db.commit()
        return self.box_out(box)

    def correct_status(
        self, project_id: uuid.UUID, number: int, target: BoxStatus, reason: str, actor_id: int
    ) -> BoxOut:
        box = self.get_box(project_id, number, lock=True)
        if ORDER.index(target.value) >= ORDER.index(box.status):
            raise ConflictError(
                "Исправление может только вернуть коробку на предыдущий этап. Для движения вперёд используйте обычную смену статуса."
            )
        # совместимость: то же, что обычный переход назад; причина необязательна
        old = box.status
        box.status = target.value
        log_event(
            self.db,
            project_id,
            "box.status_corrected",
            "box",
            number,
            **{"from": old, "to": target.value, "reason": reason, "actor_id": actor_id},
        )
        self.db.commit()
        return self.box_out(box)

    def bulk_transition(
        self, project_id: uuid.UUID, numbers: list[int], target: BoxStatus
    ) -> list[BoxOut]:
        """Массовая отметка (погрузка комнаты): либо все коробки, либо ни одной."""
        wanted = sorted(set(numbers))
        boxes = self.db.scalars(
            select(Box)
            .where(Box.project_id == project_id, Box.number.in_(wanted))
            .order_by(Box.number)
            .with_for_update()
        ).all()
        missing = sorted(set(wanted) - {b.number for b in boxes})
        if missing:
            raise NotFoundError(f"Нет коробок: {', '.join(map(str, missing))}")
        problems = []
        for box in boxes:
            try:
                self._check_move(box, target)
            except ConflictError as exc:
                problems.append(f"№{box.number}: {exc.message}")
        if problems:
            raise ConflictError("Статусы не изменены. " + "; ".join(problems))
        for box in boxes:
            self._set_status(box, target)
        self.db.commit()
        return [self.box_out(b) for b in boxes]

    def _set_status(self, box: Box, target: BoxStatus) -> None:
        """Смена статуса и запись в журнал - всегда вместе, в одной транзакции с вызывающим кодом."""
        old, box.status = box.status, target.value
        log_event(
            self.db,
            box.project_id,
            "box.status_changed",
            "box",
            box.number,
            **{"from": old, "to": target.value},
        )

    def _check_move(self, box: Box, target: BoxStatus) -> None:
        check_transition(box.status, target.value)
        if (
            box.status == "packing"
            and target != BoxStatus.PACKING
            and not box.fill_later
            and not self._count(box.id)
        ):
            raise ConflictError(
                "Пустую коробку нельзя отправить дальше «собирается»: добавьте вещи или «заполнить позже»"
            )

    # --- вещи ---
    def add_items(
        self,
        project_id: uuid.UUID,
        number: int,
        names: list[str],
        first_day: bool = False,
        status: ItemStatus = ItemStatus.PACKED,
    ) -> list[ItemOut]:
        box = self.get_box(project_id, number)
        items = [
            Item(
                box_id=box.id,
                name=n,
                name_norm=normalize(n),
                first_day=first_day,
                status=status.value,
                damaged=status == ItemStatus.DAMAGED,
            )
            for n in names
        ]
        self.db.add_all(items)
        self.db.commit()
        return [_item_out(i, box.number) for i in items]

    def get_item(self, project_id: uuid.UUID, item_id: int) -> tuple[Item, Box]:
        row = self.db.execute(
            select(Item, Box)
            .join(Box, Box.id == Item.box_id)
            .where(Item.id == item_id, Box.project_id == project_id)
        ).first()
        if not row:
            raise NotFoundError("Вещь не найдена")
        return row[0], row[1]

    def update_item(
        self,
        project_id: uuid.UUID,
        item_id: int,
        name: str | None,
        status: ItemStatus | None,
        lost: bool | None = None,
        first_day: bool | None = None,
        damaged: bool | None = None,
    ) -> ItemOut:
        item, box = self.get_item(project_id, item_id)
        if name is not None:
            item.name, item.name_norm = name, normalize(name)
        if first_day is not None:
            item.first_day = first_day
        if damaged is not None and damaged != item.damaged:
            item.damaged = damaged
            log_event(
                self.db,
                project_id,
                "item.damage_changed",
                "item",
                item.id,
                damaged=damaged,
                name=item.name,
            )
        if status == ItemStatus.DAMAGED:
            item.damaged = True
        if status is None and lost is not None:  # старый формат: флажок «потеряна»
            status = ItemStatus.LOST if lost else ItemStatus.FOUND
        if status is not None and status != item.status:
            old, item.status = item.status, status.value
            event = {ItemStatus.LOST: "item.lost", ItemStatus.FOUND: "item.found"}.get(
                status, "item.status_changed"
            )
            log_event(
                self.db,
                project_id,
                event,
                "item",
                item.id,
                name=item.name,
                **{"from": old, "to": status.value},
            )
        self.db.commit()
        return _item_out(item, box.number)

    def move_item(
        self, project_id: uuid.UUID, item_id: int, from_number: int, to_number: int, actor_id: int
    ) -> ItemOut:
        item, source = self.get_item(project_id, item_id)
        target = self.get_box(project_id, to_number)
        if source.id == target.id:
            return _item_out(item, target.number)
        if source.number != from_number:
            raise ConflictError("Вещь уже переложили в другую коробку. Обновите карточку.")
        moved = self.db.execute(
            update(Item)
            .where(Item.id == item_id, Item.box_id == source.id)
            .values(box_id=target.id)
            .returning(Item.id),
            execution_options={"synchronize_session": False},
        ).scalar_one_or_none()
        if moved is None:
            self.db.rollback()
            raise ConflictError("Вещь уже переложили в другую коробку. Обновите карточку.")
        log_event(
            self.db,
            project_id,
            "item.moved",
            "item",
            item_id,
            from_box=source.number,
            to_box=target.number,
            actor_id=actor_id,
            name=item.name,
        )
        self.db.commit()
        self.db.refresh(item)
        return _item_out(item, target.number)

    def delete_item(self, project_id: uuid.UUID, item_id: int) -> None:
        item, _ = self.get_item(project_id, item_id)
        self.db.delete(item)
        self.db.commit()

    # --- поиск ---
    def search(
        self, project_id: uuid.UUID, q: str, offset: int, limit: int, room: str | None = None
    ) -> tuple[list[SearchHit], int]:
        needle = normalize(q)
        if not needle:
            raise ValidationFailed("Пустой поисковый запрос")
        stem = search_stem(needle)
        # формы слова: «зарядка» находит и «Зарядки для телефонов»; точные совпадения всё равно выше
        match = or_(
            Item.name_norm.contains(needle, autoescape=True),
            Item.name_norm.contains(stem, autoescape=True),
        )
        where = [Box.project_id == project_id, match]
        if room:
            where.append(Box.room == room.strip())
        rank = case(
            (Item.name_norm == needle, 0),
            (
                or_(
                    Item.name_norm.startswith(needle, autoescape=True),
                    Item.name_norm.contains(" " + needle, autoescape=True),
                ),
                1,
            ),
            else_=2,
        )
        total = (
            self.db.scalar(
                select(func.count(Item.id)).join(Box, Box.id == Item.box_id).where(*where)
            )
            or 0
        )
        rows = self.db.execute(
            select(Item, Box)
            .join(Box, Box.id == Item.box_id)
            .where(*where)
            .order_by(rank, Box.number, Item.id)  # детерминированный порядок
            .offset(offset)
            .limit(limit)
        ).all()
        hits = [
            SearchHit(
                item_id=i.id,
                name=i.name,
                item_status=i.status,
                lost=i.status == ItemStatus.LOST,
                damaged=bool(i.damaged),
                box_number=b.number,
                room=b.room,
                status=b.status,
            )  # type: ignore[arg-type]
            for i, b in rows
        ]
        return hits, total

    # --- этикетка и прогресс ---
    @staticmethod
    def _label_out(project: Project, box: Box) -> LabelOut:
        if project.qr_mode == "compact" and box.qr_code is None:
            raise ConflictError("Компактный код коробки отсутствует. Проверьте миграцию базы.")
        return LabelOut(
            number=box.number,
            room=box.room,
            project_name=project.name,
            qr_path=f"/projects/{project.id}/boxes/{box.number}",
            qr_payload=box.qr_code.code if project.qr_mode == "compact" and box.qr_code else None,
            items_preview=[i.name for i in box.items[:5]],
        )

    def label(self, project: Project, number: int) -> LabelOut:
        return self._label_out(project, self.get_box(project.id, number))

    def labels(self, project: Project, numbers: list[int] | None) -> list[LabelOut]:
        """Этикетки для печати нескольких коробок сразу. Несуществующие номера пропускаются."""
        q = (
            select(Box)
            .where(Box.project_id == project.id)
            .options(selectinload(Box.items), selectinload(Box.qr_code))
            .order_by(Box.number)
        )
        if numbers is not None:
            q = q.where(Box.number.in_(numbers))
        return [self._label_out(project, box) for box in self.db.scalars(q)]

    def progress(self, project_id: uuid.UUID) -> ProgressOut:
        zero = {s: 0 for s in ORDER}
        by_room: dict[str, dict[str, int]] = {}
        for room, status, count in self.db.execute(
            select(Box.room, Box.status, func.count(Box.id))
            .where(Box.project_id == project_id)
            .group_by(Box.room, Box.status)
        ):
            by_room.setdefault(room, dict(zero))[status] = count
        total_by_status = dict(zero)
        rooms = []
        for room in sorted(by_room):
            counts = by_room[room]
            total = sum(counts.values())
            loaded = counts["loaded"] + counts["delivered"] + counts["unpacked"]
            for s, c in counts.items():
                total_by_status[s] += c
            rooms.append(
                RoomProgress(
                    room=room,
                    total=total,
                    by_status=counts,
                    loaded=loaded,
                    loaded_percent=round(100 * loaded / total, 1),
                    unpacked=counts["unpacked"],
                    unpacked_percent=round(100 * counts["unpacked"] / total, 1),
                )
            )
        total = sum(total_by_status.values())
        filled = (
            self.db.scalar(
                select(func.count(func.distinct(Item.box_id)))
                .join(Box, Box.id == Item.box_id)
                .where(Box.project_id == project_id)
            )
            or 0
        )
        return ProgressOut(
            boxes_total=total,
            by_status=total_by_status,
            unpacked_percent=round(100 * total_by_status["unpacked"] / total, 1) if total else 0.0,
            rooms=rooms,
            coverage=round(filled / total, 2) if total else 0.0,
        )
