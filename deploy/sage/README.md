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
