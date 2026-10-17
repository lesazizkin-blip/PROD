# Эксплуатация: деплой, CI/CD, копии базы, наблюдаемость

## 1. Где работает

**Адрес:** https://hack-led-20-vm1-12902f.vmaas-spirit.t-education.com (Swagger: `/api/docs`).
ВМ `vm1` в Spirit VMaaS: IP `178.72.185.97`, Ubuntu 24.04, пользователь `root`. Открыты порты 22, 80, 443, 8000–8100 («Сетевые доступы» группы ВМ).

`/opt/movermate/deploy/docker-compose.yml` (копия `deploy/docker-compose.yml`), два контейнера:
- `app` — сайт и API в одном образе (корневой `Dockerfile`), SQLite в томе `movermate-data`, при старте `alembic upgrade head` и демо-проект (`SEED_DEMO=true`);
- `caddy` — принимает 80 и 443, сам получает и продлевает сертификат Let's Encrypt (действует до 14.01.2027), `http` перенаправляет на `https`, проксирует на `app:8000`. Сертификаты в томе `caddy-data`: **том не удалять** (лимиты Let's Encrypt). HTTPS обязателен — без него браузер не даёт камеру сканеру.

Настройки сервера — в `/opt/movermate/deploy/.env` только на ВМ (образец `deploy/.env.example`): `SITE_ADDRESS`, `APP_IMAGE`, `DEMO_PASSWORD`, ключи ИИ, Sage, карт. Менять значение без показа на экране и перезапускать app: `scripts/vm-env.sh <ИМЯ>`.

Ключ ВМ `~/.ssh/vm1.pem` есть только у владельца проекта (скачивается на странице ВМ в Spirit), права 600, **в репозиторий не коммитится**.

## 2. CI/CD (GitLab организаторов)

Код — в GitLab `hack-led-20/prod_1` (https://gitlab.t-education.com), ветка `master` защищена: изменения идут через Merge Request.
```bash
scripts/gitlab-login.sh   # один раз: токен (read_api, read/write_repository) скрыто в связку ключей macOS
git push -o merge_request.create -o merge_request.target=master gitlab HEAD:refs/heads/dev
```
Зелёный пайплайн MR → Merge → пайплайн `master` сам выкатывает сайт. SSH до GitLab с компьютера не проходит, работает HTTPS. GitHub `MOVERMATE` — запасная копия (`main` = `master` GitLab). Каждый участник коммитит под своим именем.

```
lint ──► test ──► build:image ──► setup:vm ──► deploy:vm ──► preflight:prod
```

| Задание | Когда | Что делает |
|---|---|---|
| `lint-backend`, `lint-frontend` | любая ветка | ruff, oxlint, `tsc` |
| `test-backend` | любая ветка | pytest с покрытием на SQLite и те же тесты на PostgreSQL, миграции вверх-вниз-вверх; отчёты junit и cobertura в GitLab |
| `test-frontend` | любая ветка | vitest с покрытием, сборка сайта; отчёты junit и cobertura, html в артефактах |
| `build:image` | MR и `master` | Kaniko (шаблон `.dp_build`): `registry.spirit.t-education.com/hack-led-20/prod_1:<sha>` |
| `setup:vm` | `master` | ставит на ВМ Spirit CLI `dp`, если его нет |
| `deploy:vm` | `master` | копия базы, новые `docker-compose.yml`/`Caddyfile`/`backup.sh`, вход в registry ключом сервис-аккаунта, `pull` и `up` нового образа, запись `APP_IMAGE` в `.env`; Caddy пересоздаётся, только если изменился `Caddyfile` |
| `preflight:prod` | `master` | `scripts/preflight.sh` по живому сайту: весь сценарий ТЗ на временном проекте демо-аккаунта |

Отличия от шаблона организаторов (`templates/l2sh-template`): деплой в существующий стек `/opt/movermate/deploy` (адрес и сертификат сохраняются), адреса `culab.ru` заменены на `t-education.com`, образ `base-noble` — на `kroniak/ssh-client:3.19`, базовые образы — через `mirror.gcr.io` (у Docker Hub лимит с общих раннеров).

CI-переменные: `SSH_PRIVATE_KEY` (тип «Файл», содержимое `vm1.pem` с переводом строки в конце, «Защищённая») — в репозитории; `SPIRIT_DOCKER_SA_KEY` — на уровне тенанта. `DEPLOY_VM` и `DEPLOY_SSH_USER` не секреты и записаны в `.gitlab-ci.yml`.

## 3. Ручной передеплой (запасной путь)

```bash
rsync -az --delete -e "ssh -i ~/.ssh/vm1.pem" \
  --exclude=.git --exclude=docs --exclude=node_modules --exclude=dist --exclude=mobile \
  --exclude=.venv --exclude='*.db' --exclude=.env --exclude=__pycache__ \
  ./ root@178.72.185.97:/opt/movermate/
ssh -i ~/.ssh/vm1.pem root@178.72.185.97 'cd /opt/movermate/deploy && docker compose up -d --build'
scripts/preflight.sh https://hack-led-20-vm1-12902f.vmaas-spirit.t-education.com
```
`--exclude=.env` сохраняет настройки на ВМ, база в томе сохраняется. Состояние: `ssh … 'docker ps; docker logs --tail 50 deploy-app-1'`.

## 4. Копии базы и восстановление

`deploy/backup.sh` делает онлайн-копию SQLite (backup API, корректно во время записи), проверяет `integrity_check` и число проектов, хранит 48 последних в `/root/backups` (`app-<дата>-<метка>.db`). Запуск: каждый час в :17 (`/etc/cron.d/movermate-backup`, лог `/var/log/movermate-backup.log`) и перед каждой выкаткой (метка `ci`).

Восстановление:
```bash
ssh -i ~/.ssh/vm1.pem root@178.72.185.97
cd /opt/movermate/deploy && ls -1t /root/backups | head    # выбрать копию
docker compose stop app
docker cp /root/backups/<копия>.db deploy-app-1:/data/app.db
docker compose start app
```
Затем `scripts/preflight.sh <адрес>`.

## 5. Безопасность на границе

Caddy добавляет `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (камера только для самого сайта) и скрывает `Server`; `preflight.sh` их проверяет.

## 6. Проверка работоспособности

```bash
scripts/preflight.sh <адрес>   # сценарий ТЗ на временном проекте + заголовки безопасности
scripts/e2e.sh                 # прод по API (ТЗ, доп. функции) + локально права, приглашения и проклик интерфейса в Chrome
```

## 7. Наблюдаемость в Sage

**Логи** отправляет `backend/app/sage_appender.py` (в фоне через очередь: без сети записи теряются, сайт не тормозит) на `https://sage.spirit.t-education.com/api/hack-led-20/multiline/`, группа `hack-led-20`, `system="movermate"`, `env="production"`. Ключ ставится скрыто: `scripts/sage-setup.sh`. При старте приложение пишет `"sage_appender": true`.

| Запись | Поля |
|---|---|
| `msg="request"` — каждый запрос к API | `method`, `path`, `status`, `latency_ms`, `user_id`, `request_id`; уровень по статусу (5xx ERROR, 4xx WARN) |
| `msg="audit"` — действия пользователей | `action` (`auth.login`, `auth.login_failed`, `box.created`, `box.status_changed`, `project.deleted`, `invite.created`…), только id |
| `msg="unhandled_exception"` | стек, `request_id`, `path` |
| `msg="app_error"`, `msg="validation_failed"` | код ошибки, путь |

В каждой записи — `message` (текст для человека, у ошибок — тип и текст), `trace_id` и `span_id`; тот же `trace_id` сайт отдаёт в заголовке `x-trace-id` рядом с `x-request-id`. Названия вещей, комнат и проектов в логи не пишутся.

```
group="hack-led-20" system="movermate" level="ERROR" | fields @timestamp, message, error_type, trace_id
group="hack-led-20" system="movermate" trace_id="<trace_id>"
```

**Трейсы** (`backend/app/tracing.py`, OpenTelemetry): спан запроса по шаблону маршрута (у Sage лимит 300 операций), внутри SQL без значений параметров и вызов модели `ai.chat_completion`; 5xx помечает спан ERROR. Отправка (OTLP gRPC) включается адресом коллектора `scripts/vm-env.sh SAGE_TRACES_ENDPOINT` (`https://<хост>:4319`). **Не включено:** на `sage.spirit.t-education.com` порты 4317–4319 закрыты (17.10), хост уточнить у организаторов.

**Алерты** — `deploy/sage/alerts.yaml`: ошибки сервера, подбор паролей, медленные ответы, сервис молчит. В интерфейсе Sage: Алертинг → «+ Алерт» → MageQL; запрос из `expr`, интервал из `for`, адрес доставки — заранее в «Алертинг → Адреса». **В интерфейсе пока не заведены.**

**Дашборд** — запросы для панелей (Поиск → «Визуализация», ось X `@timestamp`):

| Панель | Запрос MageQL |
|---|---|
| Запросы по статусам | `group="hack-led-20" system="movermate" msg="request" \| eval status=string(status) \| timechart span=5m count by status` |
| Ошибки | `group="hack-led-20" system="movermate" level="ERROR" \| timechart span=5m count` |
| Время ответа | `group="hack-led-20" system="movermate" msg="request" \| timechart span=5m avg(latency_ms) as avg_ms, max(latency_ms) as max_ms` |
| Самые медленные адреса | `group="hack-led-20" system="movermate" msg="request" \| stats avg(latency_ms) as avg_ms, count by path \| sort -avg_ms` |
| Действия пользователей | `group="hack-led-20" system="movermate" msg="audit" \| timechart span=15m count by action` |
| Входы и неудачи | `group="hack-led-20" system="movermate" action:"auth.*" \| stats count by action` |
| Активные пользователи | `group="hack-led-20" system="movermate" msg="request" \| stats dc(user_id) as users` |
