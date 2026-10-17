#!/usr/bin/env bash
# Запуск готового сайта одной командой: бэкенд сам отдаёт и API, и сайт на одном порту (без Node и Docker).
#   scripts/run-site.sh            сайт на http://localhost:8000
#   PORT=9000 scripts/run-site.sh  другой порт
# Сборка сайта берётся из папки готовый-сайт/ или frontend/dist/; если её нет и есть Node, собирается сама.
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8000}"

SITE="${STATIC_DIR:-}"
if [ -z "$SITE" ]; then
  for d in "$ROOT/готовый-сайт" "$ROOT/frontend/dist"; do
    [ -f "$d/index.html" ] && { SITE="$d"; break; }
  done
fi
if [ -z "$SITE" ]; then
  command -v npm >/dev/null || { echo "Нет готовой сборки сайта и нет Node (npm) для её сборки." >&2; exit 1; }
  echo "Собираю сайт (один раз)…"
  (cd "$ROOT/frontend" && npm ci && npm run build)
  SITE="$ROOT/frontend/dist"
fi

cd "$ROOT/backend"
# окружение есть и в нём стоят зависимости (проверка импортом переживает перенос папки)
if ! .venv/bin/python -c 'import uvicorn' 2>/dev/null; then
  echo "Готовлю окружение бэкенда (один раз)…"
  python3 -m venv --clear .venv
  .venv/bin/pip install -q -r requirements.txt -c constraints.txt
fi
.venv/bin/python -m alembic upgrade head
.venv/bin/python -m app.seed   # демо-проект «Переезд на Лесную»; повторный запуск ничего не дублирует

echo
echo "Сайт: http://localhost:$PORT   (Swagger: http://localhost:$PORT/api/docs)"
echo "Демо: «Войти», логин demo, пароль demo-pereezd. Остановить: Ctrl+C."
# SEED_DEMO=true создаёт демо-аккаунт и демо-проект
SEED_DEMO=true STATIC_DIR="$SITE" exec .venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
