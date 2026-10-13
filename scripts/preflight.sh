#!/usr/bin/env bash
# Предполётная проверка перед сдачей: то, что жюри откроет в первую очередь.
# Использование: scripts/preflight.sh http://1.2.3.4   (по умолчанию http://localhost:8080)
set -u
BASE="${1:-http://localhost:8080}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin12345}"
USER_EMAIL="${USER_EMAIL:-user@example.com}"
USER_PASSWORD="${USER_PASSWORD:-user12345}"
fail=0

check() {  # check "описание" команда...
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then printf '  \033[32mOK\033[0m   %s\n' "$name"
  else printf '  \033[31mFAIL\033[0m %s\n' "$name"; fail=1; fi
}
# Токен передаётся в заголовке через stdin, а не в аргументах: в `ps` его не видно
authed_get() { printf 'Authorization: Bearer %s\n' "$T" | curl -fsS -H @- "$1"; }
has_demo_data() { authed_get "$BASE/api/items?limit=100" | python3 -c 'import sys,json;sys.exit(0 if json.load(sys.stdin)["total"]>=5 else 1)'; }
has_stats() { authed_get "$BASE/api/stats" | grep -q by_status; }
token() { curl -fsS -X POST "$BASE/api/auth/login" -H 'content-type: application/json' \
  -d "{\"email\":\"$1\",\"password\":\"$2\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])'; }

echo "Проверяем $BASE"
check "главная страница открывается (React)"      sh -c "curl -fsS '$BASE/' | grep -q 'id=\"root\"'"
check "API жив и видит БД (/api/health)"          sh -c "curl -fsS '$BASE/api/health' | grep -q ok"
check "Swagger доступен (/api/docs)"              curl -fsS -o /dev/null "$BASE/api/docs"
check "OpenAPI-схема отдаётся"                    sh -c "curl -fsS '$BASE/api/openapi.json' | grep -q '\"openapi\"'"
check "вход обычным пользователем"                token "$USER_EMAIL" "$USER_PASSWORD"
check "вход администратором"                      token "$ADMIN_EMAIL" "$ADMIN_PASSWORD"
if T=$(token "$ADMIN_EMAIL" "$ADMIN_PASSWORD" 2>/dev/null); then
  check "в системе есть демо-данные (>= 5 записей)" has_demo_data
  check "статистика считается (/api/stats)"         has_stats
fi
check "без токена API отвечает 401, а не 500"     sh -c "[ \"\$(curl -s -o /dev/null -w '%{http_code}' '$BASE/api/items')\" = 401 ]"
check "неизвестный путь API -> 404"               sh -c "[ \"\$(curl -s -o /dev/null -w '%{http_code}' '$BASE/api/nope')\" = 404 ]"

echo
if [ $fail -eq 0 ]; then echo "Всё в порядке. Не забудьте: CI зелёный, README актуален, презентация загружена."
else echo "Есть проблемы - исправьте до стоп-кодинга."; fi
exit $fail
