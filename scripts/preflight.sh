#!/usr/bin/env bash
# Предполётная проверка перед сдачей: то, что жюри откроет в первую очередь.
# Использование: scripts/preflight.sh https://адрес-сайта   (по умолчанию http://localhost:8000, scripts/run-site.sh)
# Локальная разработка: scripts/preflight.sh http://localhost:5173 (Vite проксирует /api на :8000).
# Нужны curl и python3. Скрипт входит в демо-аккаунт (нужен SEED_DEMO=true), сам создаёт и удаляет
# временный проект, демо-данные не меняет.
set -u
BASE="${1:-http://localhost:8000}"
DEMO_ID="${DEMO_PROJECT_ID:-00000000-0000-4000-8000-000000000001}"  # python -m app.seed
JAR="$(mktemp)"  # cookie сессии; удаляется при выходе
trap 'rm -f "$JAR"' EXIT
fail=0

check() {  # check "описание" команда...
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then printf '  \033[32mOK\033[0m   %s\n' "$name"
  else printf '  \033[31mFAIL\033[0m %s\n' "$name"; fail=1; fi
}

EMPTY_BODY='{}'
api() { curl -fsS -b "$JAR" "$BASE/api$1"; }  # api /путь -> тело ответа, ненулевой код при 4xx/5xx
post() { curl -fsS -b "$JAR" -c "$JAR" -X POST "$BASE/api$1" -H 'content-type: application/json' -d "${2:-$EMPTY_BODY}"; }
code() {  # code МЕТОД /путь [тело] -> HTTP-код (без падения на 4xx)
  curl -s -b "$JAR" -o /dev/null -w '%{http_code}' -X "$1" "$BASE/api$2" -H 'content-type: application/json' ${3:+-d "$3"}
}
anon_code() { curl -s -o /dev/null -w '%{http_code}' "$BASE/api$1"; }  # тот же запрос без входа
json() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }  # json "выражение над d"
ok_if() { python3 -c "import sys,json;d=json.load(sys.stdin);sys.exit(0 if ($1) else 1)"; }

# ---- проверки данных демо-проекта ----
demo_progress_ok() {  # 10+ коробок и все 5 статусов представлены
  api "/projects/$DEMO_ID/progress" | ok_if "d['boxes_total']>=10 and all(v>0 for v in d['by_status'].values())"
}
demo_tasks_ok() { api "/projects/$DEMO_ID/tasks" | ok_if "len(d)>=10 and any(t['done'] for t in d) and {t['stage'] for t in d}=={'before','moving_day','after'}"; }
demo_search_ok() {  # поиск находит вещь и показывает коробку, комнату и статус
  curl -fsS -b "$JAR" -G "$BASE/api/projects/$DEMO_ID/search" --data-urlencode 'q=чайник' \
    | ok_if "d['total']>=1 and all(k in d['items'][0] for k in ('box_number','room','status'))"
}
demo_lost_ok() { api "/projects/$DEMO_ID/items/lost" | ok_if "len(d)>=1"; }
security_headers_ok() {  # Caddy на проде: HSTS, nosniff, запрет встраивания в рамку
  local h; h="$(curl -fsS -D - -o /dev/null "$BASE/" | tr -d '\r' | tr 'A-Z' 'a-z')"
  echo "$h" | grep -q '^strict-transport-security:' && echo "$h" | grep -q '^x-content-type-options: nosniff' \
    && echo "$h" | grep -q '^x-frame-options: deny'
}
reference_ok() { api /task-templates | ok_if "len(d)>=10" && api /tips | ok_if "{t['topic'] for t in d}=={'fragile','carry_with_you','pack_last'}"; }

# ---- полный сценарий на временном проекте ----
scenario() {  # временный проект всегда удаляется, даже если проверка упала
  local pid rc
  pid="$(post /projects '{"name":"preflight","move_date":"2030-01-01"}' | json "d['id']")" || return 1
  scenario_body "$pid"; rc=$?
  curl -s -b "$JAR" -o /dev/null -X DELETE "$BASE/api/projects/$pid?confirm=true"
  [ "$rc" = 0 ] && [ "$(code GET "/projects/$pid")" = 404 ]  # и правда удалился вместе с содержимым
}
scenario_body() {
  local pid="$1" n lbl
  api "/projects/$pid/tasks" | ok_if "len(d)>=10 and all(t['due_date'] for t in d)" || return 1  # стандартный план и сроки создаются сервером
  post "/projects/$pid/tasks/apply-templates" | ok_if "d['added']==0" || return 1  # повторное применение не дублирует шаблоны
  n="$(post "/projects/$pid/boxes" '{"room":"Кухня","items_text":"Чайник\nКружки"}' | json "d['number']")" || return 1
  [ "$n" = 1 ] || return 1                                                            # номер выдаёт сервер
  [ "$(code POST "/projects/$pid/boxes/$n/transitions" '{"to":"unpacked"}')" = 409 ] || return 1
  for stage in packed loaded delivered unpacked; do
    post "/projects/$pid/boxes/$n/transitions" "{\"to\":\"$stage\"}" | ok_if "d['status']=='$stage'" || return 1
  done
  post "/projects/$pid/boxes/$n/transitions" '{"to":"packed"}' | ok_if "d['status']=='packed'" || return 1  # назад - на любой этап без причины
  post "/projects/$pid/boxes/$n/status-corrections" '{"to":"packing"}' | ok_if "d['status']=='packing'" || return 1  # старая ручка совместимости
  lbl="$(api "/projects/$pid/boxes/$n/label" | json "d['qr_path']")" || return 1
  [ "$lbl" = "/projects/$pid/boxes/$n" ] || return 1                                  # QR ведёт на карточку коробки
  [ "$(code GET "/projects/$pid/boxes/$n")" = 200 ] || return 1                       # повторное открытие карточки
  [ "$(anon_code "/projects/$pid/boxes/$n")" = 401 ] || return 1                     # по QR без входа - только экран входа
  api "/projects/$pid/boxes" | ok_if "d['total']==1" || return 1                      # дублей нет
  [ "$(code DELETE "/projects/$pid/boxes/$n")" = 422 ] || return 1                    # удаление требует подтверждения
  [ "$(code DELETE "/projects/$pid/boxes/$n?confirm=true")" = 204 ] || return 1
}

echo "Проверяем $BASE"
echo "Сайт и документация"
check "главная страница открывается (React)"                sh -c "curl -fsS '$BASE/' | grep -q 'id=\"root\"'"
check "ссылка из QR открывает приложение (SPA-маршрут)"     sh -c "curl -fsS '$BASE/projects/$DEMO_ID/boxes/1' | grep -q 'id=\"root\"'"
check "API жив и видит БД (/api/health)"                    sh -c "curl -fsS '$BASE/api/health' | grep -q '\"db\":\"ok\"'"
check "Swagger доступен (/api/docs)"                        curl -fsS -o /dev/null "$BASE/api/docs"
check "OpenAPI-схема отдаётся"                              sh -c "curl -fsS '$BASE/api/openapi.json' | grep -q '\"openapi\"'"
check "неизвестный путь API -> 404"                         sh -c "[ \"\$(curl -s -o /dev/null -w '%{http_code}' '$BASE/api/nope')\" = 404 ]"

case "$BASE" in https://*)
  echo "Безопасность"
  check "заголовки безопасности (HSTS, nosniff, X-Frame-Options)" security_headers_ok ;;
esac

echo "Вход и доступ"
check "без входа проект закрыт (401)"                       sh -c "[ \"\$(curl -s -o /dev/null -w '%{http_code}' '$BASE/api/projects/$DEMO_ID')\" = 401 ]"
check "вход в демо-аккаунт (POST /api/auth/demo)"           post /auth/demo
check "после входа видно, кто вошёл (/api/auth/me)"          sh -c "curl -fsS -b '$JAR' '$BASE/api/auth/me' | grep -q username"

echo "Справочники и демо-данные"
check "шаблоны задач и памятки на месте"                    reference_ok
if [ "$(code GET "/projects/$DEMO_ID")" = 200 ]; then
  check "демо: 10+ коробок во всех пяти статусах"           demo_progress_ok
  check "демо: задачи трёх этапов, часть выполнена"         demo_tasks_ok
  check "демо: поиск вещи показывает коробку, комнату, статус" demo_search_ok
  check "демо: есть потерянная вещь"                        demo_lost_ok
else
  printf '  \033[31mFAIL\033[0m демо-проект не открылся: нужен SEED_DEMO=true (или python -m app.seed)\n'; fail=1
fi

echo "Сценарий ТЗ на временном проекте"
check "проект → шаблонные задачи → коробка → статусы → этикетка → удаление" scenario

echo
if [ $fail -eq 0 ]; then echo "Всё в порядке. Не забудьте: CI зелёный, README актуален, презентация загружена."
else echo "Есть проблемы - исправьте до стоп-кодинга."; fi
exit $fail
