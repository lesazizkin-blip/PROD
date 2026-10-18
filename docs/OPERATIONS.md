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
| `deploy:vm` | `master` | копия базы, новые `docker-compose.yml`/`Caddyfile`/`backup.sh`, вход в registry ключом сервис-аккаунта, `pull` и `up` нового образа, запись `APP_IMAGE` в `.env`; `caddy reload` применяет новый `Caddyfile` без простоя (ошибочный не применяется) |
| `preflight:prod` | `master` | `scripts/preflight.sh` по живому сайту: весь сценарий ТЗ на временном проекте демо-аккаунта |

Отличия от шаблона организаторов (`templates/l2sh-template`): деплой в существующий стек `/opt/movermate/deploy` (адрес и сертификат сохраняются), адреса `culab.ru` заменены на `t-education.com`, образ `base-noble` — на `kroniak/ssh-client:3.19`, базовые образы — через `mirror.gcr.io` (у Docker Hub лимит с общих раннеров).

CI-переменные: `SSH_PRIVATE_KEY` (тип «Файл», содержимое `vm1.pem` с переводом строки в конце, «Защищённая») — в репозитории; `SPIRIT_DOCKER_SA_KEY` — на уровне тенанта. `DEPLOY_VM` и `DEPLOY_SSH_USER` не секреты и записаны в `.gitlab-ci.yml`.

## 3. Ручной передеплой (запасной путь)

```bash
rsync -az --delete -e "ssh -i ~/.ssh/vm1.pem" \
  --exclude=.git --exclude=docs --exclude=node_modules --exclude=dist \
  --exclude=.venv --exclude='*.db' --exclude=.env --exclude=__pycache__ \
  --exclude=docker-compose.override.yml --exclude=.maintenance --exclude=spirit-sa-key.json \
  ./ root@178.72.185.97:/opt/movermate/
ssh -i ~/.ssh/vm1.pem root@178.72.185.97 'cd /opt/movermate/deploy && docker compose up -d --build'
scripts/preflight.sh https://hack-led-20-vm1-12902f.vmaas-spirit.t-education.com
```
`--exclude=.env` сохраняет настройки на ВМ, база в томе сохраняется; override и `.maintenance` на ВМ не удаляются. Пока на ВМ есть `docker-compose.override.yml` с `image:`, `--build` перезапишет закреплённый образ — передеплой только по согласованию с Фёдором. Без сети (после 16:00) — только `docker compose up -d --no-build` или `docker start deploy-app-1`, никаких `pull` и `--build`. Состояние: `ssh … 'docker ps; docker logs --tail 50 deploy-app-1'`.

## 4. Копии базы и восстановление

`deploy/backup.sh` делает онлайн-копию SQLite (backup API, корректно во время записи), проверяет `integrity_check` и число проектов, хранит 48 последних в `/root/backups` (`app-<дата>-<метка>.db`). Запуск: каждый час в :17 (`/etc/cron.d/movermate-backup`, лог `/var/log/movermate-backup.log`) и перед каждой выкаткой (метка `ci`).

Восстановление (сторож на время работ выключается файлом `.maintenance`, иначе он поднимет app посреди копирования):
```bash
ssh -i ~/.ssh/vm1.pem root@178.72.185.97
cd /opt/movermate/deploy && ls -1t /root/backups | head    # выбрать копию
touch .maintenance                                         # сторож не вмешивается
docker compose stop app
docker cp /root/backups/<копия>.db deploy-app-1:/data/app.db
docker compose run --rm --no-deps -u root --entrypoint sh app -c 'rm -f /data/app.db-journal; chown app:app /data/app.db'
docker compose start app
rm .maintenance
```
`docker cp` создаёт файл от root, а приложение работает от пользователя `app`: без `chown` база будет только для чтения. Затем `scripts/preflight.sh <адрес>`.

## 5. Безопасность на границе

Caddy добавляет `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (камера и микрофон только для самого сайта: сканер QR и голосовой ввод) и скрывает `Server`; `preflight.sh` их проверяет.

## 5а. Защита от перегрузки и злоупотреблений

| Уровень | Что | Где |
|---|---|---|
| Caddy | таймауты против медленных атак (заголовки 10 с, тело 60 с, ответ 90 с, простой 2 мин), тело запроса не больше 8 МБ | `deploy/Caddyfile` |
| Приложение | не больше 1200 запросов к `/api` с одного IP в минуту и 30 регистраций с IP в час, дальше 429 с `Retry-After`; `/api/health` не ограничен. Лимиты щедрые, потому что жюри может выходить в сеть с одного адреса. Настройки `API_REQUESTS_PER_MINUTE`, `REGISTRATIONS_PER_HOUR` (0 выключает) | `backend/app/throttle.py` |
| Вход | не больше 10 неудачных попыток на пару «IP + логин» за 5 минут | `services/auth.py` |
| ИИ | 10 попыток в час на пользователя и 50 в сутки на всех, попытка списывается до платного вызова | `services/ai_budget.py` |
| uvicorn | при наплыве больше 300 одновременных запросов лишние сразу получают 503, память не растёт | `Dockerfile` |
| Docker | лимит памяти app 1,5 ГБ, Caddy 512 МБ; логи контейнеров не больше 50 МБ (не забьют диск) | `deploy/docker-compose.yml` |
| Цены по городам | раз в сутки в 04:30 по cron: `docker exec deploy-app-1 python -m app.price_update`, лог `/var/log/movermate-prices.log`; при ошибке остаются прежние цены | `backend/app/price_update.py` |
| Сторож | раз в минуту по cron: упавший стек поднимается, а app, зависший на 3 минуты подряд, перезапускается; не вмешивается во время выкатки (общая блокировка `flock /run/movermate.lock`) и обслуживания (файл `.maintenance`) | `deploy/watchdog.sh`, лог `/var/log/movermate-watchdog.log` |
| Демо | демо-проект удалить нельзя; если данные в нём испортили — `ssh … 'docker exec deploy-app-1 python -m app.seed --reset-demo'` пересоздаёт его | `backend/app/seed.py` |

После отключения сети (стоп-кодинг) стек живёт сам: контейнеры с `restart: unless-stopped`, docker стартует при загрузке ВМ, образ лежит локально, сертификат действует до 14.01.2027, логи в Sage без сети просто теряются. При возврате сети ничего делать не нужно; проверка — `scripts/preflight.sh <адрес>`.

## 6. Проверка работоспособности

```bash
scripts/preflight.sh <адрес>   # сценарий ТЗ на временном проекте + заголовки безопасности
scripts/e2e.sh                 # прод по API (ТЗ, доп. функции) + локально права, приглашения и проклик интерфейса в Chrome
```

## 7. Наблюдаемость в Sage

**Логи** отправляет `backend/app/sage_appender.py` (в фоне через очередь: без сети записи теряются, сайт не тормозит) на `https://sage.spirit.t-education.com/api/hack-led-20/multiline/`, группа `hack-led-20`, `system="movermate"`, `env="production"`. Ключ ставится скрыто: `scripts/sage-setup.sh`. При старте приложение пишет `"sage_appender": true`.

| Запись | Поля |
|---|---|
| `msg="request"` — каждый запрос к API | `method`, `path` (токен приглашения маскируется), `status`, `latency_ms`, `user_id`, `request_id`, `check` (только у автоматических проверок: `e2e`, `preflight`, `ui`); уровень по статусу (5xx ERROR, 4xx WARN). WARN от проверок ожидаемы: они нарочно проверяют отказы 401/403/404/409/422 |
| `msg="audit"` — действия пользователей | `action` (`auth.login`, `auth.login_failed`, `box.created`, `box.status_changed`, `project.deleted`, `invite.created`…), только id |
| `msg="unhandled_exception"` | стек, `request_id`, `path` |
| `msg="app_error"`, `msg="validation_failed"` | код ошибки, путь |

В каждой записи — `message` (текст для человека, у ошибок — тип и текст), `trace_id` и `span_id`; тот же `trace_id` сайт отдаёт в заголовке `x-trace-id` рядом с `x-request-id`. Названия вещей, комнат и проектов в логи не пишутся.

```
group="hack-led-20" system="movermate" level="ERROR" | fields @timestamp, message, error_type, trace_id
group="hack-led-20" system="movermate" trace_id="<trace_id>"
```

**Трейсы** (`backend/app/tracing.py`, OpenTelemetry): спан запроса по шаблону маршрута (у Sage лимит 300 операций), внутри SQL без значений параметров и вызов модели `ai.chat_completion`; 5xx помечает спан ERROR. Отправка (OTLP gRPC) включается адресом коллектора `scripts/vm-env.sh SAGE_TRACES_ENDPOINT` (`https://<хост>:4319`). **Не включено:** на `sage.spirit.t-education.com` порты 4317–4319 закрыты (17.10), хост уточнить у организаторов.

**Метрики** (`backend/app/metrics.py`) уходят в Sage по Prometheus Remote Write раз в 30 с на `https://sage.spirit.t-education.com/frost_remote_write/api/v1/write` (`SAGE_METRICS_URL`, ключ тот же `SAGE_API_KEY`, без ключа выключены). Лейблы `group`, `system="movermate"`, `env`, `dc`, `inst`. Отправка в фоне: ошибки Sage пишутся в лог не чаще раза в 10 минут и сайт не трогают.

| Метрика | Что показывает |
|---|---|
| `movermate_http_requests_total{method,code}` | запросы по классу ответа (2xx/4xx/5xx) |
| `movermate_http_request_duration_ms_sum/_count/_bucket{le}` | время ответа (среднее, гистограмма) |
| `movermate_actions_total{action}` | действия из аудита: входы, регистрации, коробки, приглашения |
| `movermate_users`, `movermate_projects`, `movermate_items`, `movermate_items_lost` | состояние данных |
| `movermate_boxes{status}` | коробки по статусам: сколько собирается, погружено, доставлено, распаковано |

Запросы (Поиск, MageQL): `pql rate(movermate_http_requests_total{system="movermate",code="5xx"}[5m])` — доля ошибок; `pql movermate_boxes{system="movermate"}` — коробки по статусам; `pql rate(movermate_http_request_duration_ms_sum[5m]) / rate(movermate_http_request_duration_ms_count[5m])` — среднее время ответа. Если Remote Write не принят (в логе `metrics_push_failed`), те же числа строятся из логов через Logs2Metrics: Метрики → Logs2Metrics → «+ Метрика», запрос `group="hack-led-20" system="movermate" msg="request"`, поле `latency_ms`, лейблы `status`, `method`.

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

## Закрепление production-интерфейса (18 октября 2026)

После повторной замены интерфейса деплоем Spirit на ВМ отдельно закреплена проверенная сборка frontend из GitHub `9d1918f` (дизайн локальной версии :5186). Серверный код сохранён из актуального образа Spirit `7aeefc06`; текущий составной образ — `movermate:ui9d1918f-api7aeefc06`.

На ВМ `/opt/movermate/deploy/docker-compose.override.yml` подключает `/opt/movermate-ui/9d1918f/site` к `/app/site` только для чтения. Обычный `docker compose` автоматически учитывает этот файл, в том числе при CI-деплое, который обновляет основной `docker-compose.yml`. База остаётся в прежнем томе. Настройки окружения не меняются, кроме `APP_IMAGE`.

**При следующем обновлении визуала недостаточно заменить образ:** сначала подготовьте новую папку с полной сборкой `site`, затем измените путь bind mount в override и пересоздайте только `app`. Проверьте главную страницу и её asset-хеши с публичного адреса. Не отключайте закрепление без согласованной замены: исходники frontend в Spirit ещё могут отличаться от GitHub.

Чтобы снова брать интерфейс из образа, после проверки его сборки уберите только это подключение `site` из override и пересоздайте `app`. Производственные override и `.env` хранятся на ВМ; резервная копия перед восстановлением — `/root/movermate-ui-restore`, памятка — `/opt/movermate-ui/README.txt`.

18 октября: frontend обновлён до `f48d2cc` — исправление статуса без ручного ввода причины, печать этикеток без отдельной кнопки предпросмотра, QR-сканер и ручной ввод без распознавания рукописи. Активный mount в override: `/opt/movermate-ui/f48d2cc/site:/app/site:ro`. Серверный образ продолжает обновляться из Spirit; фактические образ и путь интерфейса проверяйте через `docker inspect deploy-app-1`.

### Согласованный релиз описи и переноса вещей: 894a21b

Активный production-релиз: `registry.spirit.t-education.com/hack-led-20/prod_1:inventory-894a21b` (digest `sha256:376f5434a9b0e279251ab2bb658d9bc381280bd5c1a418633622902ca119c183`). Базовый серверный образ Spirit — `d7b93a08`; поверх него добавлены изменения описи/переноса из GitHub `894a21b`, миграция `0010_item_damage` и собранный frontend. Полный Dockerfile и контекст сборки сохранены на ВМ в `/opt/movermate-builds/inventory-894a21b`. Образ опубликован в существующем Spirit registry, его можно подтянуть обычным `docker compose pull app`.

В production override теперь закреплены **образ app и интерфейс** `/opt/movermate-ui/894a21b/site:/app/site:ro`. Это сохраняет совместимость API, схемы базы и UI при независимых деплоях Spirit. Для следующего согласованного релиза необходимо явно обновить `image` и путь `site` в `/opt/movermate/deploy/docker-compose.override.yml`, а также `APP_IMAGE` в `.env`; затем пересоздать только app. Сначала проверьте миграции и запуск на копии базы. Старый образ без `0010_item_damage` не является совместимым откатом для новой базы.

Перед выкладкой проверена копия production-базы: все исходные записи сохранены, две старые отметки `status=damaged` перенесены в независимый признак. Копии до и после: `/root/movermate-inventory-backup`. Исходники production backend, миграции и frontend в `/opt/movermate` синхронизированы с релизом. Экспериментальные локальные серверы и worktree не являются источником production-образа без проверки этого override.

18 октября: frontend `7ebdfac` исправляет выбор проекта и доступ к рабочим экранам после архивации. Активный mount — `/opt/movermate-ui/23bfd59/site:/app/site:ro`; серверный образ остаётся `inventory-894a21b`, миграции не менялись. Перед выпуском проверены единственный архивный проект, прямые ссылки на коробки/этикетки/настройки, восстановление, выбор другого активного проекта, перезагрузка и две вкладки. Изменение касается локального архива браузера; серверные данные проектов не удаляются.

Frontend `23bfd59`: в мобильной шапке ссылка на проекты показана иконкой без текста «Все проекты»; ссылка сохраняет доступное имя и область нажатия 44 × 44 px. Проверено на ширинах 320, 390 и 844 px и на production.
