# GitLab: сдача кода и CI

По Положению (п. 4.9) решения команд размещаются на GitLab организаторов: https://gitlab.t-education.com, проект команды **`hack-led-20/prod_1`**, ветка `master`. В проекте уже лежат два файла организаторов: `.gitlab-ci.yml` (заглушка `test: echo ok`) и `policy.yml` (fast-forward для MR).

## Текущее состояние (17.10)
- **Источник истины — GitLab `hack-led-20/prod_1`**, ветка `master`. GitHub `MOVERMATE` — запасная копия.
- `master` защищён: push только у Maintainer, сливать Merge Request могут Developer и Maintainer. Поэтому изменения идут так: push в ветку `dev` с открытием MR (`git push -o merge_request.create -o merge_request.target=master gitlab HEAD:refs/heads/dev`) → зелёный пайплайн MR → Merge → пайплайн `master` с деплоем.
- Все изменения идут через MR (к вечеру 17.10 слито 38). Пайплайн проходит целиком, включая `setup:vm`, `deploy:vm` и `preflight:prod`.
- SSH до GitLab с компьютера не проходит (порт 22 сбрасывает соединение), работает HTTPS с токеном; токен лежит в связке ключей macOS (`scripts/gitlab-login.sh`).

## Как отправить код
1. `scripts/gitlab-login.sh` — токен вводится тихо, ложится в связку ключей macOS (scope `write_repository`).
2. `scripts/push-to-gitlab.sh` — забирает `master` организаторов, вливает историю без force-push; при конфликте `.gitlab-ci.yml` оставляет наш (он построен по их шаблону, а у них в `master` заглушка `test: echo ok`), их `policy.yml` сохраняется. Если `master` защищён для роли Developer, пушить в ветку `dev` и открыть Merge Request.
3. Каждый участник коммитит под своим именем (`git config user.name` и `user.email`).

## Пайплайн (автодеплой по шаблону `templates/l2sh-template`)

```
lint ──► test ──► build:image ──► setup:vm ──► deploy:vm ──► preflight:prod
```

| Задание | Когда | Что делает |
|---|---|---|
| `lint-backend`, `lint-frontend` | любая ветка | ruff, oxlint, `tsc`; не блокируют остальное |
| `test-backend` | любая ветка | pytest с покрытием на SQLite (отчёт и процент видны в GitLab), те же тесты на PostgreSQL, миграции вверх-вниз-вверх |
| `test-frontend` | любая ветка | vitest и сборка сайта |
| `build:image` | `master` и Merge Request | шаблон `.dp_build` (Kaniko): корневой `Dockerfile` → `registry.spirit.t-education.com/hack-led-20/prod_1:<sha>` |
| `setup:vm` | `master` | ставит на ВМ Spirit CLI `dp`, если его нет |
| `deploy:vm` | `master` | копия базы в `/root/backups`, обновляет на ВМ `deploy/docker-compose.yml` и `Caddyfile`, входит в registry ключом сервис-аккаунта, `docker compose pull app` и `up -d` с новым образом; `deploy/.env`, база и сертификаты не трогаются |
| `preflight:prod` | `master` | `scripts/preflight.sh` по живому сайту: весь сценарий ТЗ через демо-вход |

Отличия от шаблона: деплой не в `~/app` на порт 8080, а в существующий стек `/opt/movermate/deploy` (Caddy с HTTPS + app), чтобы адрес сайта и сертификат остались прежними; устаревшие адреса `culab.ru` заменены на `t-education.com` (с раннеров не резолвятся), образ `base-noble` — на `kroniak/ssh-client:3.19`; ключ `SSH_PRIVATE_KEY` перед использованием очищается от `\r` и получает перевод строки в конце.

## Что завести в CI-переменных
Spirit → **Код → Репозитории → prod_1 → CI-переменные → Добавить переменную**:

| Ключ | Тип | Значение | Флаги |
|---|---|---|---|
| `SSH_PRIVATE_KEY` | **Файл** | всё содержимое `~/.ssh/vm1.pem`, **с переводом строки в конце** | «Защищённая» (файл замаскировать нельзя) |

Больше ничего заводить не нужно:
- `SPIRIT_DOCKER_SA_KEY` уже заведена организаторами на уровне тенанта (Сборка → CI-переменные).
- `DEPLOY_VM` (`178.72.185.97`) и `DEPLOY_SSH_USER` (`root`) — не секреты, записаны в `.gitlab-ci.yml`; переменная с тем же именем в Spirit их переопределит.

«Защищённая» переменная видна только в защищённых ветках: если `master` не защищён, снимите этот флаг, иначе `deploy:vm` скажет «Нет SSH_PRIVATE_KEY».

## Что проверено
Все задания пайплайна прошли на раннерах организаторов (пайплайн 11105, 17.10): шаблон `.dp_build` из `pipelines/pipelines`, сборка Kaniko, вход в registry ключом сервис-аккаунта, выкатка на ВМ и `preflight.sh` по живому сайту.
