# API-контракт MoverMate

> Договорённость между бэкендом и фронтендом, до кода. Единственный источник правды после реализации — Swagger (`/api/docs`) и `frontend/src/api/types.ts`; при расхождении исправляем сразу.
> Все пути с префиксом `/api`. JSON, UTF-8, даты — ISO 8601 (`2026-11-01`, время — UTC `…Z`).

## Общие соглашения

- **Доступ:** вход по логину и паролю (раздел «Вход и приглашения»). Сессия — httpOnly-cookie `mm_session` (`SameSite=Lax`, на проде `Secure`), браузер отправляет её сам. Все пути `/api/projects…` требуют входа (`401` без него). Проект видят только его участники: чужой проект отвечает `404`, как несуществующий. Удалить проект и приглашать может только владелец (`403` для участника).
- **Коробка** адресуется номером `{n}` (целое ≥ 1), уникальным внутри проекта. QR кодирует обычную ссылку на карточку: `{origin}/projects/{pid}/boxes/{n}`; её открывает любая камера телефона, сканер на сайте разбирает её же. Открытие карточки только читает, дублей не создаёт.
- **Ошибки** (формат шаблона, `backend/app/main.py`):

```json
{ "detail": "Нельзя распаковать недоставленную коробку", "code": "conflict", "request_id": "…" }
```

Валидация (422) дополнительно содержит `"errors": [{"field": "name", "message": "…"}]`.

| Код | `code` | Когда |
|---|---|---|
| 400 | `bad_request` | нечитаемый запрос |
| 401 | `unauthorized` | не вошли, сессия истекла, неверный логин или пароль |
| 403 | `forbidden` | участник пытается удалить проект или пригласить людей |
| 404 | `not_found` | нет проекта (или он чужой), коробки, вещи, задачи, приглашения |
| 409 | `conflict` | недопустимый переход статуса, дубль номера при ручной выдаче |
| 422 | `validation_failed` | неверные поля, нет `confirm=true` при удалении |
| 429 | `too_many_requests` | больше 10 неудачных входов за 5 минут с одного IP на один логин |

- **Пагинация** (списки коробок, вещей, поиска, событий): `?page=1&page_size=50` (по умолчанию 1 и 50, максимум `page_size` = 200). Ответ:

```json
{ "items": [ … ], "total": 312, "page": 1, "page_size": 50 }
```

- **Сортировка детерминирована:** везде есть вторичный ключ `id`/`number`, одинаковый запрос всегда даёт одинаковый ответ.
- **Удаление с подтверждением:** `DELETE` требует `?confirm=true`, иначе 422. Диалог подтверждения показывает сайт. Успех — `204 No Content`.

## Статусы коробки

```
packing (собирается) → packed (собрана) → loaded (погружена) → delivered (доставлена) → unpacked (распакована)
```

Допустимо: переход вперёд на один шаг и откат на один шаг назад (исправление ошибки). Всё остальное — `409 conflict`. Таблица переходов — чистая функция в `backend/app/services/`, покрыта юнит-тестами.

| Из | Можно в |
|---|---|
| `packing` | `packed` |
| `packed` | `loaded`, `packing` |
| `loaded` | `delivered`, `packed` |
| `delivered` | `unpacked`, `loaded` |
| `unpacked` | `delivered` |

Этапы задач: `before`, `moving_day`, `after`.

## Схемы

```jsonc
// Project
{ "id": "uuid", "name": "Переезд на Лесную", "move_date": "2026-11-01",
  "address_from": null, "address_to": null, "created_at": "…Z" }

// Task
{ "id": 1, "project_id": "uuid", "stage": "before", "title": "Заказать грузчиков",
  "due_date": "2026-10-25", "assignee": "Аня", "done": false, "done_at": null,
  "template_id": 3 }

// Box
{ "number": 12, "project_id": "uuid", "room": "Кухня", "status": "packed",
  "fill_later": false, "remind_at": null, "items_count": 6,
  "created_at": "…Z", "updated_at": "…Z" }

// Item
{ "id": 77, "box_number": 12, "name": "Чайник", "lost": false, "created_at": "…Z" }

// Event
{ "id": 5, "type": "box.status_changed", "entity": "box", "entity_id": "12",
  "data": { "from": "packed", "to": "loaded" }, "created_at": "…Z" }
```

---

## Служебные

### `GET /api/health`
Проверка работоспособности. `200 {"status": "ok", "db": "ok", "version": "…"}`; при недоступной БД `503`.

### `GET /api/task-templates`
Шаблоны задач (хранятся локально, сидятся). `200 [{ "id": 3, "stage": "before", "title": "Заказать грузчиков", "default_offset_days": -14 }]`.

### `GET /api/tips`
Памятки. `200 [{ "id": 1, "topic": "fragile" | "carry_with_you" | "pack_last", "title": "…", "body": "…" }]`. Необязательный `?topic=`.

---

## Вход и приглашения

Хранятся только логин и хэш пароля (scrypt с солью); токен сессии и приглашения в базе лежит как SHA-256.

### `POST /api/auth/register`
`{ "username": "anna", "password": "…" }`. Логин 3–40 символов (латиница, цифры, `.`, `-`, `_`), без регистра; пароль 8–128. `201` User `{id, username}` и cookie сессии; `409`, если логин занят.

### `POST /api/auth/login`
То же тело. `200` User и cookie; `401` «Неверный логин или пароль» (одна формулировка, не выдаёт существующие логины); `429` при переборе.

### `POST /api/auth/demo`
Вход в демо-аккаунт без пароля, только при `SEED_DEMO=true` (иначе `404`). `200` User.

### `POST /api/auth/logout` · `GET /api/auth/me`
Выход (`204`, сессия удаляется) и текущий пользователь (`200` User или `401`).

### `POST /api/projects/{pid}/invites`
Только владелец. `201 { "token", "path": "/invite/{token}", "expires_at" }`. Ссылка действует 7 дней, по ней может войти несколько человек.

### `GET /api/invites/{token}`
Без входа: `200 { "project_name", "expires_at" }`, чтобы показать, куда зовут; `404`, если нет или истекло.

### `POST /api/invites/{token}/accept`
Нужен вход. Добавляет в проект участником (повторно — без дублей). `200` Project.

## Проекты

### `GET /api/projects`
Мои проекты: `200 [ { "id", "name", "move_date", "role": "owner" | "member" } ]`.

### `POST /api/projects`
Создаёт проект (вошедший пользователь становится владельцем), сразу применяет шаблоны задач (по `move_date + default_offset_days`) и шаблон чек-листа первого дня.

Запрос: `{ "name": "…", "move_date": "2026-11-01", "address_from": null, "address_to": null }`. `name` 1–120 символов, `move_date` обязательна, адреса необязательны (≤ 300).
Ответ `201`: Project.

### `GET /api/projects/{pid}`
`200` Project; `404`, если нет.

### `PATCH /api/projects/{pid}`
Любые из `name`, `move_date`, `address_from`, `address_to`. `200` Project.

### `DELETE /api/projects/{pid}?confirm=true`
Только владелец. Удаляет проект и всё внутри (каскад). `204`.

---

## Задачи (5.1)

### `GET /api/projects/{pid}/tasks`
Фильтры: `stage`, `done` (`true|false`). Сортировка: `stage` (before, moving_day, after), `due_date` (без срока — в конце), `id`. Без пагинации (десятки записей). `200 [Task]`.

### `POST /api/projects/{pid}/tasks`
`{ "stage": "before", "title": "…", "due_date": null, "start_time": "09:00", "end_time": "12:30", "category": "Грузчики", "category_color": "#f0a04b", "assignee": null }`. Всё, кроме `stage` и `title`, необязательно. `title` 1–200, `assignee` ≤ 80, `category` ≤ 40. Время — `ЧЧ:ММ` без часового пояса, конец позже начала (иначе `422`); в ответе `ЧЧ:ММ:СС`. `category_color` — `#RRGGBB`, без категории цвет не хранится. `201` Task. Событие `task.created`.

### `PATCH /api/projects/{pid}/tasks/{tid}`
Любые из `title`, `stage`, `due_date`, `start_time`, `end_time`, `category`, `category_color`, `assignee`, `done`; `null` очищает необязательное поле. Время проверяется по итоговым значениям (можно прислать только `end_time`). Сброс `category` сбрасывает и цвет. При `done: true` ставится `done_at`. `200` Task. Событие `task.completed` / `task.reopened`.

### `DELETE /api/projects/{pid}/tasks/{tid}?confirm=true`
`204`.

### `POST /api/projects/{pid}/tasks/apply-templates`
Добавляет шаблонные задачи, которых ещё нет (идемпотентно, по `template_id`). `200 { "added": 4 }`.

---

## Коробки (5.2)

### `GET /api/projects/{pid}/boxes`
Фильтры: `room` (точное совпадение), `status`, `fill_later` (`true|false`), `number` (точный номер), пагинация. Сортировка: `number` по возрастанию. `200` страница Box.

### `POST /api/projects/{pid}/boxes`
`{ "room": "Кухня", "fill_later": false, "remind_at": null, "items_text": null }`.
- `room` 1–60 символов, обязательна.
- Номер выдаёт сервер: атомарно `max(number)+1` внутри проекта (`UNIQUE(project_id, number)` как страховка; при гонке сервер повторяет попытку). Клиент номер не передаёт.
- `items_text` необязательно: строки = вещи (то же, что `bulk`).
- `fill_later: true` допускает пустую коробку; `remind_at` необязательна.
`201` Box. Событие `box.created`.

### `GET /api/projects/{pid}/boxes/{n}`
Карточка коробки (то, что открывает QR): Box плюс `items: [Item]`. `200`; `404`, если номера нет. Не создаёт ничего.

### `PATCH /api/projects/{pid}/boxes/{n}`
Любые из `room`, `fill_later`, `remind_at`. Номер и статус сюда не входят. `200` Box.

### `DELETE /api/projects/{pid}/boxes/{n}?confirm=true`
Удаляет коробку и её вещи. Номер повторно не используется. `204`. Событие `box.deleted`.

### `POST /api/projects/{pid}/boxes/{n}/transitions`
`{ "to": "loaded" }`. Проверка по таблице переходов. `200` Box. Ошибки: `409` (недопустимый переход, в `detail` указано «из → в» и допустимые варианты), `422` (неизвестный статус). Событие `box.status_changed` с `from`/`to`.
Дополнительно: нельзя перейти из `packing` в `packed`, если коробка пуста и `fill_later = false` → `409` с понятным текстом.

### `POST /api/projects/{pid}/boxes/bulk-transitions`
Для чек-листа погрузки: `{ "numbers": [1,2,3], "to": "loaded" }`. Применяется атомарно: если хоть один переход недопустим, не меняется ничего, `409` с перечнем номеров. `200 { "updated": [Box] }`.

---

## Вещи (5.2, 5.4)

### `GET /api/projects/{pid}/boxes/{n}/items`
Пагинация. Сортировка: `id`. `200` страница Item.

### `POST /api/projects/{pid}/boxes/{n}/items`
`{ "name": "Чайник" }`, 1–120 символов. `201` Item.

### `POST /api/projects/{pid}/boxes/{n}/items/bulk`
Быстрый ввод: `{ "text": "Чайник\nКружки (4 шт)\nТостер" }`. Каждая непустая строка = вещь, пробелы по краям срезаются, пустые строки игнорируются, максимум 200 строк за запрос. Дубли внутри коробки не схлопываются (две одинаковые вещи допустимы). `201 { "created": [Item] }`. Сбрасывает «ожидание заполнения» (`fill_later` остаётся флагом, но напоминание исчезает, как только в коробке есть вещь).

### `PATCH /api/projects/{pid}/items/{id}`
Любые из `name`, `lost`. `lost: true` — пометить потерянной. `200` Item. Событие `item.lost` / `item.found`.

### `DELETE /api/projects/{pid}/items/{id}?confirm=true`
`204`.

### `GET /api/projects/{pid}/items/lost`
Список потерянных вещей проекта, с коробкой, комнатой и статусом. `200 [{ item, box_number, room, status }]`.

### `GET /api/projects/{pid}/items/{id}/hints`
Подсказки: в каких **нераспакованных** коробках искать вещь. Берутся коробки со статусом не `unpacked`, кроме коробки самой вещи, если она уже записана в этой коробке (тогда она первая, `reason: "recorded"`).
Ранжирование (детерминированное, оценка по убыванию, потом номер):
1. `recorded` — вещь записана в этой коробке.
2. `similar_content` — в коробке лежат вещи со схожими словами в названии.
3. `same_room` — коробка предназначена для той же комнаты, что и коробка вещи.
`200 [{ "box_number": 7, "room": "Кухня", "status": "delivered", "reason": "same_room", "score": 0.6 }]`, максимум 10.

---

## Поиск (5.3)

### `GET /api/projects/{pid}/search?q=чайник`
Поиск вещей по названию среди всех коробок проекта. Регистр не важен, `ё = е`. Пагинация. `q` — минимум 1 символ (после обрезки пробелов).
Ранжирование: точное совпадение, затем начало слова, затем вхождение; внутри группы `box_number`, затем `item.id` (детерминировано).
Ответ — страница:

```json
{ "items": [
  { "item_id": 77, "name": "Чайник", "lost": false,
    "box_number": 12, "room": "Кухня", "status": "packed" }
  ], "total": 1, "page": 1, "page_size": 50 }
```

Коробку по номеру ищут через `GET /boxes?number=12` или `GET /boxes/{n}`.

---

## Этикетки (5.3)

### `GET /api/projects/{pid}/boxes/{n}/label`
Данные этикетки; изображение QR строит сайт в браузере.

```json
{ "number": 12, "room": "Кухня", "project_name": "Переезд на Лесную",
  "qr_path": "/projects/{pid}/boxes/12", "items_preview": ["Чайник", "Кружки (4 шт)"] }
```

`qr_path` — путь внутри проекта; сайт склеивает его с `window.location.origin`, получая ссылку для QR. QR не зависит от внешних сервисов.

### `GET /api/projects/{pid}/labels?numbers=1,2,3`
Пакет для печати нескольких этикеток (максимум 100 номеров). Без параметра `numbers` — все коробки. Отсутствующие номера пропускаются. `200 [Label]`, порядок по `number`.

---

## Контроль и прогресс (5.4)

### `GET /api/projects/{pid}/progress`

```json
{
  "boxes_total": 40,
  "by_status": { "packing": 5, "packed": 10, "loaded": 8, "delivered": 7, "unpacked": 10 },
  "unpacked_percent": 25.0,
  "rooms": [
    { "room": "Кухня", "total": 12,
      "by_status": { "packing": 1, "packed": 2, "loaded": 3, "delivered": 2, "unpacked": 4 },
      "loaded": 9, "loaded_percent": 75.0,
      "unpacked": 4, "unpacked_percent": 33.3 }
  ],
  "coverage": 0.9
}
```

- `loaded` в комнате = коробки со статусом `loaded` и дальше (`loaded + delivered + unpacked`): уже погружены. Это данные для «чек-листа погрузки по комнатам».
- `unpacked_percent` = `unpacked / total` (по всем коробкам комнаты; вопрос 6 в `CASE.md`).
- `coverage` = коробки хотя бы с одной вещью / все коробки.
- Комнаты отсортированы по названию.

### `GET /api/projects/{pid}/reminders`
Коробки, о которых надо напомнить: `fill_later = true` и в коробке нет вещей, и (`remind_at` пуст или `remind_at ≤ сейчас`). `200 [{ "box": Box, "overdue": true }]`.

### Чек-лист первого дня

Пункты хранятся отдельно от задач этапов.

- `GET /api/projects/{pid}/first-day` → `200 [{ "id": 1, "title": "Зубные щётки", "done": false }]`, сортировка по `id`.
- `POST /api/projects/{pid}/first-day` `{ "title": "Чайник" }` → `201`.
- `PATCH /api/projects/{pid}/first-day/{id}` `{ "done": true, "title": "…" }` → `200`.
- `DELETE /api/projects/{pid}/first-day/{id}?confirm=true` → `204`.

---

## Журнал событий (раздел 8 ТЗ)

### `GET /api/projects/{pid}/events`
Пагинация, новые сверху (`id` по убыванию). Фильтр `type`. Типы: `project.created`, `project.updated`, `task.created`, `task.completed`, `task.reopened`, `box.created`, `box.deleted`, `box.status_changed`, `item.lost`, `item.found`. Данные событий не содержат персональных данных, кроме названий, которые ввёл пользователь. `200` страница Event.

---

## Умный ассистент (раздел 6 ТЗ)

Реализованы `checklist` и `checklist/apply`. `room-plan` и `box-from-photo` — **не реализованы** (описаны как возможное развитие).

По умолчанию работает **локально, на правилах**, без внешних вызовов. Все ответы только предлагают: данные меняются отдельным вызовом пользователя.

### `POST /api/projects/{pid}/assistant/checklist`
`{ "with_children": true, "with_pets": false, "other_city": true }` → `200 { "suggested_tasks": [{ "stage": "before", "title": "Собрать документы на ребёнка", "reason": "with_children" }], "suggested_first_day": [ "Любимая игрушка", "Подгузники" ] }`.
`POST /api/projects/{pid}/assistant/checklist/apply` с тем же телом добавляет предложенное (идемпотентно, не дублирует заголовки). `200 { "added_tasks": 5, "added_first_day": 3 }`.

### `POST /api/projects/{pid}/assistant/room-plan`
`{ "room": "Кухня", "description": "30 тарелок, 3 сковородки, микроволновка, много специй" }` → `200 { "boxes_estimate": 6, "packing_order": ["Специи", "Тарелки", "…"], "suggestions": [ { "kind": "donate_or_discard", "text": "Проверьте сроки годности специй" } ] }`. Правила и словарь категорий хранятся локально.

### `POST /api/projects/{pid}/assistant/box-from-photo` (опционально)
`multipart/form-data`, файл `photo`. Требует явного согласия: заголовок `X-External-Processing-Consent: true`, иначе `403`. Если внешняя модель не настроена — `501 {"code": "not_implemented"}`. Результат — предложенный список вещей, который пользователь подтверждает через `items/bulk`. Фото на сервере не сохраняется.

---

## Тест-сценарии, которые этот контракт должен выдержать

| Сценарий | Ожидание |
|---|---|
| Два параллельных `POST /boxes` | номера разные, без пропусков внутри проекта, без 500 |
| `transitions` `packing → unpacked` | `409` |
| `transitions` `delivered → unpacked` | `200` |
| `GET /boxes/12` дважды, затем `GET /boxes?number=12` | одна и та же коробка, `total` не меняется |
| `GET /search?q=чайник` дважды | идентичный ответ, идентичный порядок |
| `DELETE` без `confirm=true` | `422`, данные на месте |
| `bulk-transitions` с одним недопустимым номером | `409`, ни один статус не изменён |
| Проект на 300 коробок и 3000 вещей | `GET /boxes`, `/search`, `/progress` отвечают быстро (цель ≤ 300 мс на обычной машине) |
| Обновление страницы | состояние берётся из API по сохранённому `pid` |
