# Наблюдаемость MoverMate в Sage

Логи приложения уходят в Sage аппендером `backend/app/sage_appender.py`:
`https://sage.spirit.t-education.com/api/hack-led-20/multiline/`, группа `hack-led-20`, `system="movermate"`, `env="production"`.
Ключ записывается на ВМ скриптом `scripts/sage-setup.sh` (скрытый ввод). При старте приложение пишет `"sage_appender": true`.

## Что в логах

| Запись | Поля | Пример поиска |
|---|---|---|
| `msg="request"` — каждый запрос к API | `method`, `path`, `status`, `latency_ms`, `user_id`, `request_id`; уровень по статусу (5xx ERROR, 4xx WARN) | `group="hack-led-20" system="movermate" msg="request" status>=500` |
| `msg="audit"` — действия пользователей | `action` (`auth.login`, `auth.login_failed`, `auth.registered`, `box.created`, `box.status_changed`, `project.deleted`, `invite.created`…), id без содержимого | `group="hack-led-20" system="movermate" action="auth.login_failed"` |
| `msg="unhandled_exception"` | стек, `request_id`, `path` | по `request_id` из ответа 500 |
| `msg="app_error"`, `msg="validation_failed"` | код ошибки, путь | `level="WARN" msg="validation_failed"` |

Названия вещей, комнат и проектов в логи не пишутся (`audit` их отбрасывает).

Общие поля каждой записи, кроме обязательных `@timestamp`, `env`, `system`, `inst`, `level`:
- `message` — текст для человека: `POST /api/projects/…/room-plan → 502 planner_invalid_response: Модель вернула некорректную раскладку…`;
  у необработанной ошибки — тип и текст исключения, отдельно `error_type` и стек в `exc`;
- `trace_id` (32 hex) и `span_id` (16 hex) — трейс OpenTelemetry этого запроса. Тот же `trace_id` сайт отдаёт
  в заголовке ответа `x-trace-id`, рядом с `x-request-id`.

Найти ошибку и всё, что было в том же запросе:

```
group="hack-led-20" system="movermate" level="ERROR" | fields @timestamp, message, error_type, trace_id
group="hack-led-20" system="movermate" trace_id="<trace_id из ошибки или из x-trace-id>"
```

## Трейсы

`backend/app/tracing.py` (OpenTelemetry SDK): запрос к API — серверный спан с именем по шаблону маршрута
(`GET /api/projects/{pid}/boxes`, не путь с id — у Sage лимит 300 операций), внутри — спаны SQL (`db SELECT`,
текст с плейсхолдерами, без значений) и вызова модели (`ai.chat_completion`: модель, код ошибки). Ошибка 5xx
помечает спан статусом ERROR и сохраняет исключение. Проверка здоровья не трейсится.

Ресурсные атрибуты по требованиям Sage: `service.namespace=hack-led-20`, `service.name=movermate`,
`service.instance.id=<хост>`, `deployment.environment=prod`, `sage.group=hack-led-20`; выборка always_on,
пакетная отправка, gzip, авторизация `JWT <SAGE_API_KEY>`.

Отправка включается адресом коллектора (OTLP gRPC): `scripts/vm-env.sh SAGE_TRACES_ENDPOINT`, значение
`https://<хост коллектора трейсов>:4319`. **Хост уточнить у организаторов**: на `sage.spirit.t-education.com`
порты 4317–4319 закрыты (проверено 17.10 с ВМ). Без адреса `trace_id` всё равно пишется в логи и заголовок.

## Алерты

`alerts.yaml` — четыре алерта в формате «Алерты YAML Git»: ошибки сервера, подбор паролей, медленные ответы, сервис молчит.
Без подключения Git каждый заводится в интерфейсе: Алертинг → «+ Алерт» → MageQL; запрос — из `expr`,
интервал — из `for`, условие — числовое поле из запроса (`count`, `avg_ms`). Адрес доставки создаётся заранее в «Алертинг → Адреса».

## Дашборд: запросы для панелей

Вставляйте в Поиск Sage, на вкладке «Визуализация» выбирайте ось X `@timestamp` и сохраняйте панель на дашборд.

| Панель | Запрос MageQL |
|---|---|
| Запросы по статусам | `group="hack-led-20" system="movermate" msg="request" \| eval status=string(status) \| timechart span=5m count by status` |
| Ошибки | `group="hack-led-20" system="movermate" level="ERROR" \| timechart span=5m count` |
| Время ответа | `group="hack-led-20" system="movermate" msg="request" \| timechart span=5m avg(latency_ms) as avg_ms, max(latency_ms) as max_ms` |
| Самые медленные адреса | `group="hack-led-20" system="movermate" msg="request" \| stats avg(latency_ms) as avg_ms, count by path \| sort -avg_ms` |
| Действия пользователей | `group="hack-led-20" system="movermate" msg="audit" \| timechart span=15m count by action` |
| Входы и неудачи | `group="hack-led-20" system="movermate" action:"auth.*" \| stats count by action` |
| Активные пользователи | `group="hack-led-20" system="movermate" msg="request" \| stats dc(user_id) as users` |
