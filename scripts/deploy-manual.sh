#!/usr/bin/env bash
# Ручной деплой с ноутбука: копирует проект на сервер и запускает docker compose там.
# Использование:  scripts/deploy-manual.sh user@host
#   PORT=8080 POSTGRES_PASSWORD=... SECRET_KEY=... ADMIN_PASSWORD=... scripts/deploy-manual.sh user@host
# Опционально: SSH_KEY=~/.ssh/prod_deploy   SSH_PORT=2222   REMOTE_DIR=prod-app
# ВАЖНО: скрипт не проверялся на реальном сервере - прогоните его заранее, если есть любая Linux-машина.
set -euo pipefail

TARGET="${1:?Укажите user@host}"
REMOTE_DIR="${REMOTE_DIR:-prod-app}"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
[ -n "${SSH_KEY:-}" ] && SSH_OPTS+=(-i "$SSH_KEY")
[ -n "${SSH_PORT:-}" ] && SSH_OPTS+=(-p "$SSH_PORT")
cd "$(dirname "$0")/.."

echo ">> Проверяем доступ и Docker на $TARGET"
ssh "${SSH_OPTS[@]}" "$TARGET" 'docker compose version >/dev/null' \
  || { echo "На сервере нет docker compose (или нет прав). См. docs/DEPLOY.md"; exit 1; }

echo ">> Копируем проект"
ssh "${SSH_OPTS[@]}" "$TARGET" "mkdir -p ~/$REMOTE_DIR"
rsync -az --delete -e "ssh ${SSH_OPTS[*]}" \
  --exclude '.git' --exclude 'node_modules' --exclude '.venv' --exclude '__pycache__' \
  --exclude 'dist' --exclude '.env' --exclude '*.db' --exclude '.pytest_cache' --exclude '.ruff_cache' \
  ./ "$TARGET:~/$REMOTE_DIR/"

echo ">> Записываем .env на сервере (права 600)"
printf 'PORT=%s\nPOSTGRES_PASSWORD=%s\nSECRET_KEY=%s\nADMIN_PASSWORD=%s\nSEED_DEMO=%s\n' \
  "${PORT:-80}" "${POSTGRES_PASSWORD:-app}" \
  "${SECRET_KEY:-dev-secret-change-me-dev-secret-change-me}" "${ADMIN_PASSWORD:-admin12345}" "${SEED_DEMO:-true}" \
  | ssh "${SSH_OPTS[@]}" "$TARGET" "umask 077; cat > ~/$REMOTE_DIR/.env"

echo ">> Собираем и запускаем"
ssh "${SSH_OPTS[@]}" "$TARGET" "cd ~/$REMOTE_DIR && docker compose up -d --build"

HOST="${TARGET#*@}"
echo ">> Готово. Проверьте: ADMIN_PASSWORD=... scripts/preflight.sh http://$HOST:${PORT:-80}"
