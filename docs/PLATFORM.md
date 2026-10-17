# Платформа организаторов: что есть и как пользоваться

Изучено 16.10.2026 (просмотр в браузере, ничего не менялось). Тенант команды — `hack-led-20`.

| Сервис | Адрес | Для чего нам |
|---|---|---|
| Spirit | https://spirit.t-education.com | облако: ВМ, реестр образов, CI-переменные, ключи Sage и LLM |
| GitLab | https://gitlab.t-education.com | сдача кода (п. 4.9 Положения) и CI; проект `hack-led-20/prod_1` |
| Sage | https://sage.spirit.t-education.com | наблюдаемость: логи, метрики, трейсы, Grafana, алерты |
| Teleport | https://teleport.t-education.com | веб-консоль ВМ (пользователь `greg`) |

## Spirit: разделы тенанта
- **Управление → Пользователи:** группа `hack-led-20-participants` (7 человек) с ролями Registry Viewer, LLM Proxy User, GitLab developer, Registry Publisher, Sage User, Cloud Manager; сервис-аккаунт `sa-hack-led-20-spirit-docker-ci` (Registry Viewer, Registry Publisher, Cloud Manager).
- **Код → Репозитории:** репозитории тенанта; у каждого своя вкладка «CI-переменные».
- **Сборка → CI-переменные:** на уровне тенанта уже есть `SPIRIT_DOCKER_SA_KEY` (тип «Файл»); `SSH_PRIVATE_KEY` заведена в репозитории `prod_1`. **Сборка → Docker-образы:** образы `prod_1:<sha>` из пайплайна.
- **Мониторинг:** группа Sage `hack-led-20` (ДЦ ru-7, квота логов 0.1 МБ/с, хранение 14 дней, режим «логи и метрики»); Sage API ключи — пока нет; подписки на алерты.
- **Инфраструктура → Виртуальные машины:** группа `hack-led-20` (ru-3b, selectel-ru3), 1 ВМ — наша `vm1`, статус «Доступна».
- **AI:** каталог моделей LLM-прокси `https://llm-proxy.spirit.t-education.com/` (52 модели: Claude, GPT, Gemini, GigaChat, YandexGPT и др.) и аккаунты с API-ключами (личный `greg` или сервисный).

## GitLab
- `hack-led-20/prod_1`: наш код (все изменения через MR), `policy.yml` организаторов сохранён; пайплайн с автодеплоем работает (`docs/GITLAB.md`).
- Шаблон автодеплоя: `templates/l2sh-template` — `build:image` (Kaniko, шаблон `.dp_build` из `pipelines/pipelines`) → `test` → `setup:vm` (ставит Spirit CLI `dp` на ВМ) → `deploy:vm` (ssh + `docker compose pull/up`). В шаблоне указан `registry.spirit.culab.ru`, рабочий адрес — `registry.spirit.t-education.com/<тенант>/<репозиторий>:<sha>`.
- Нужные CI-переменные репозитория (Spirit → Код → Репозитории → prod_1 → CI-переменные): `SSH_PRIVATE_KEY` (Файл, с переводом строки в конце, «Защищённая»), `DEPLOY_VM` (адрес ВМ), `DEPLOY_SSH_USER` (у нас `root`), `APP_PORT`. `SPIRIT_DOCKER_SA_KEY` уже есть в тенанте. Создавать переменные может роль Project lead или Repository CI variables.

## Sage
- Документация: https://sage.spirit.t-education.com/documentation (запросы на MageQL, загрузка логов, метрик, трейсов, алерты).
- Логи принимаются через Logs Collector: `POST /api/<группа Sage>/multiline/` с заголовком `Authorization: JWT <Spirit API ключ>` или через сборщик Vector / Filebeat. Наш сервер уже пишет JSON-логи с `request_id` в stdout — их можно отправлять Vector-ом с ВМ.
- Для подключения нужен Sage API ключ (Мониторинг → Sage API ключи) — создаёт владелец, в репозиторий не коммитится.

## Что из этого можно сделать
1. ✅ **Автодеплой из GitLab** (критерий Backend-жюри): сделан 17.10, `docs/GITLAB.md`.
2. **Логи в Sage:** сделано в коде. Логи уже в формате Sage (`@timestamp`, `env`, `system=movermate`, `inst`), аппендер `backend/app/sage_appender.py` отправляет их в Logs Collector (`POST <хост>/api/hack-led-20/multiline/`, `Authorization: JWT <Spirit API ключ>`). Включить: на ВМ в `deploy/.env` задать `SAGE_LOGS_URL` и `SAGE_API_KEY`, перезапустить `app`. Хост Logs Collector в документации Sage не указан; найден проверкой 17.10: `https://sage.spirit.t-education.com/api/hack-led-20/multiline/` (без ключа отвечает `401 {"reason":"unauthorized"}`, доступен с ВМ и из контейнера). В `scripts/sage-setup.sh` вводить хост `sage.spirit.t-education.com`. Дальше — алерт MageQL на `level="ERROR"` и дашборд в Grafana.
3. **Функции раздела 6 ТЗ через LLM-прокси** («план упаковки комнаты», «опись по фото»): только с явным согласием пользователя, ТЗ запрещает скрытые передачи данных.
