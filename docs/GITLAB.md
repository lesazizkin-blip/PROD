# GitLab: сдача кода и CI

По Положению (п. 4.9) решения команд размещаются на GitLab организаторов: https://gitlab.t-education.com, проект команды **`hack-led-20/prod_1`**, ветка `master`. В проекте уже лежат два файла организаторов: `.gitlab-ci.yml` (заглушка `test: echo ok`) и `policy.yml` (fast-forward для MR).

## Текущее состояние
- Код в GitLab ещё **не отправлен**.
- SSH до GitLab с компьютера не проходит (порт 22 сбрасывает соединение), работает только HTTPS с токеном доступа.
- Прежний токен утёк и отозван: использовать только новый.

## Как отправить код
1. `scripts/gitlab-login.sh` — токен вводится тихо, ложится в связку ключей macOS (scope `write_repository`).
2. `scripts/push-to-gitlab.sh` — забирает `master` организаторов, вливает историю без force-push; при конфликте `.gitlab-ci.yml` берёт версию организаторов, а нашу сохраняет как `docs/gitlab-ci.own.yml`. Если `master` защищён для роли Developer, пушить в ветку `dev` и открыть Merge Request.
3. Каждый участник коммитит под своим именем (`git config user.name` и `user.email`).

## CI из пайплайна (критерий Backend-жюри)
Шаблон организаторов: `templates/l2sh-template` (и `pipelines/pipelines`). Пуш в `master` запускает: `build:image` (Kaniko → реестр Spirit) → `test` → `setup:vm` → `deploy:vm` (SSH и `docker compose`, порт 8080 по умолчанию).

Нужные CI-переменные (Spirit → Код → Репозитории → CI-переменные):

| Переменная | Что | Кто даёт |
|---|---|---|
| `SSH_PRIVATE_KEY` | ключ ВМ, тип «Файл», с переводом строки в конце | владелец проекта |
| `DEPLOY_VM` | адрес ВМ | владелец проекта |
| `DEPLOY_SSH_USER` | у нас `root` (по умолчанию `ubuntu`) | владелец проекта |
| `APP_PORT` | порт приложения | команда |
| `SPIRIT_DOCKER_SA_KEY` | ключ сервис-аккаунта `sa-hack-led-20-spirit-docker-ci` (Registry Publisher) | Project lead |

Что делаем: переписать `.gitlab-ci.yml` по шаблону, в задании `test` запускать тесты сервера с отчётом покрытия и тесты сайта, затем деплой на ВМ и `scripts/preflight.sh` после него. План по людям: `docs/TEAM_PLAN.md` (Бэкенд 1).

## Что не проверено
Ни одно задание на настоящем GitLab ещё не запускалось.
