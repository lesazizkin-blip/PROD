#!/usr/bin/env bash
# Полная проверка функционала (после правок дизайна и перед защитой).
#   scripts/e2e.sh [адрес-прода]
# 1) Живой сайт (по умолчанию прод): минимум ТЗ и доп. функции по API под демо-аккаунтом, во временном проекте.
# 2) Локальный сервер с текущим кодом: вход, регистрация, приглашения и права участников (создаёт аккаунты,
#    поэтому не на проде) и проклик интерфейса в headless Chrome. Нужны backend/.venv и собранный frontend/dist.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="$ROOT/backend/.venv/bin/python"
PROD="${1:-https://hack-led-20-vm1-12902f.vmaas-spirit.t-education.com}"
TMP="$(mktemp -d)"; PORT=8019; fail=0
trap 'kill $SERVER 2>/dev/null; rm -rf "$TMP"' EXIT

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
run() { "$@" || fail=1; }

say "Живой сайт: $PROD"
run "$PY" "$ROOT/scripts/e2e/api_minimum.py" "$PROD"
run "$PY" "$ROOT/scripts/e2e/api_features.py" "$PROD"

say "Локальный сервер с текущим кодом"
( cd "$ROOT/frontend" && npm run build --silent >/dev/null ) || { echo "сборка сайта не удалась"; exit 1; }
( cd "$ROOT/backend" && DATABASE_URL="sqlite:///$TMP/e2e.db" "$PY" -m alembic upgrade head >/dev/null 2>&1 )
( cd "$ROOT/backend" && exec env DATABASE_URL="sqlite:///$TMP/e2e.db" SEED_DEMO=true STATIC_DIR=../frontend/dist \
    "$PY" -m uvicorn app.main:app --port $PORT >"$TMP/server.log" 2>&1 ) &
SERVER=$!
for _ in $(seq 1 40); do curl -fs "http://127.0.0.1:$PORT/api/health" >/dev/null && break; sleep 0.5; done
run "$PY" "$ROOT/scripts/e2e/api_users.py" "http://127.0.0.1:$PORT"
mkdir -p "$ROOT/e2e-screens"
run "$PY" "$ROOT/scripts/e2e/ui_click.py" "http://127.0.0.1:$PORT" "$ROOT/e2e-screens"

if [ $fail = 0 ]; then say "Всё работает."; rmdir "$ROOT/e2e-screens" 2>/dev/null || true
else say "Есть ошибки: скриншоты падений в e2e-screens/"; fi
exit $fail
