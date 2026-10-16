#!/usr/bin/env bash
# Ручной деплой с ноутбука: копирует проект на сервер и запускает docker compose там.
#
#   scripts/deploy-manual.sh user@host
#   PORT=8080 SSH_PORT=2222 SSH_KEY=~/.ssh/prod_deploy scripts/deploy-manual.sh user@host
#
# Секреты (пароль БД, SECRET_KEY, пароль администратора):
#   - при первом деплое генерируются случайные и печатаются ОДИН раз (пароль админа - для README);
#   - при повторных деплоях существующий .env на сервере не трогается (пароль БД действует только
#     на пустом томе, его смена ломает запуск бэкенда);
#   - свои значения: POSTGRES_PASSWORD=... SECRET_KEY=... ADMIN_PASSWORD=... ADMIN_EMAIL=... (перезапишут .env).
# Прочее: SEED_DEMO=false (без демо-данных), REMOTE_DIR=prod-app, APP_ENV=dev (только для проверки без секретов).
# Проверено в контейнере Ubuntu 24.04, не на настоящем хостинге.
set -euo pipefail

TARGET="${1:?Укажите user@host}"
REMOTE_DIR="${REMOTE_DIR:-prod-app}"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
[ -n "${SSH_KEY:-}" ] && SSH_OPTS+=(-i "$SSH_KEY")
[ -n "${SSH_PORT:-}" ] && SSH_OPTS+=(-p "$SSH_PORT")
cd "$(dirname "$0")/.."

# Для rsync -e нужна одна строка: каждый аргумент экранируем (пути с пробелами)
RSYNC_SSH="ssh"
for o in "${SSH_OPTS[@]}"; do RSYNC_SSH+=" $(printf '%q' "$o")"; done
remote() { ssh "${SSH_OPTS[@]}" "$TARGET" "$@"; }

echo ">> Проверяем доступ, Docker (демон и права) и rsync на $TARGET"
remote 'docker info >/dev/null 2>&1' \
  || { echo "На сервере недоступен Docker (не установлен, не запущен или у пользователя нет прав). См. docs/DEPLOY.md"; exit 1; }
remote 'docker compose version >/dev/null 2>&1' \
  || { echo "На сервере нет плагина docker compose. См. docs/DEPLOY.md"; exit 1; }
remote 'command -v rsync >/dev/null' \
  || { echo "На сервере нет rsync: установите (apt-get install -y rsync) и повторите"; exit 1; }

echo ">> Копируем проект"
remote "mkdir -p ~/$REMOTE_DIR"
rsync -az --delete -e "$RSYNC_SSH" \
  --exclude '.git' --exclude 'node_modules' --exclude '.venv' --exclude '__pycache__' \
  --exclude 'dist' --exclude '.env' --exclude '*.db' --exclude '.pytest_cache' --exclude '.ruff_cache' \
  ./ "$TARGET:~/$REMOTE_DIR/"

OVERRIDES=0
for v in POSTGRES_PASSWORD SECRET_KEY ADMIN_PASSWORD; do [ -n "${!v:-}" ] && OVERRIDES=1; done
HAS_ENV=0
remote "test -f ~/$REMOTE_DIR/.env" && HAS_ENV=1

if [ "$HAS_ENV" = 1 ] && [ "$OVERRIDES" = 0 ]; then
  echo ">> На сервере уже есть .env - оставляем как есть (секреты прежние)"
else
  APP_ENV="${APP_ENV:-production}"
  POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(openssl rand -hex 16)}"
  SECRET_KEY="${SECRET_KEY:-$(openssl rand -hex 32)}"
  GENERATED_ADMIN=0
  if [ -z "${ADMIN_PASSWORD:-}" ]; then ADMIN_PASSWORD="$(openssl rand -hex 8)"; GENERATED_ADMIN=1; fi
  # Пароль БД попадает в DATABASE_URL без экранирования: только буквы и цифры
  [[ "$POSTGRES_PASSWORD" =~ ^[A-Za-z0-9]+$ ]] || { echo "POSTGRES_PASSWORD: только латинские буквы и цифры"; exit 1; }
  if [ "$APP_ENV" = production ]; then
    [ "${#SECRET_KEY}" -ge 32 ] || { echo "SECRET_KEY: не короче 32 символов"; exit 1; }
    [ "${#ADMIN_PASSWORD}" -ge 8 ] || { echo "ADMIN_PASSWORD: не короче 8 символов"; exit 1; }
  fi
  [ "$HAS_ENV" = 1 ] && echo "!! Перезаписываем .env. Если том базы уже создан, новый POSTGRES_PASSWORD не подойдёт:" \
    && echo "   либо оставьте прежний, либо сотрите данные: docker compose down -v (на сервере)"
  echo ">> Записываем .env на сервере (права 600)"
  printf 'APP_ENV=%s\nPORT=%s\nPOSTGRES_PASSWORD=%s\nSECRET_KEY=%s\nADMIN_EMAIL=%s\nADMIN_PASSWORD=%s\nSEED_DEMO=%s\n' \
    "$APP_ENV" "${PORT:-80}" "$POSTGRES_PASSWORD" "$SECRET_KEY" "${ADMIN_EMAIL:-admin@example.com}" \
    "$ADMIN_PASSWORD" "${SEED_DEMO:-true}" \
    | remote "umask 077; cat > ~/$REMOTE_DIR/.env"
  if [ "$GENERATED_ADMIN" = 1 ]; then
    echo
    echo "   Пароль администратора (${ADMIN_EMAIL:-admin@example.com}): $ADMIN_PASSWORD"
    echo "   Он показан один раз: впишите его в README (\"Как проверить\"). Хранится на сервере в ~/$REMOTE_DIR/.env"
    echo
  fi
fi

echo ">> Собираем и запускаем"
remote "cd ~/$REMOTE_DIR && docker compose up -d --build"

HOST="${TARGET#*@}"
PORT_SHOWN="${PORT:-80}"
echo ">> Готово. Проверка: ADMIN_PASSWORD=<пароль> scripts/preflight.sh http://$HOST$([ "$PORT_SHOWN" = 80 ] || echo ":$PORT_SHOWN")"
