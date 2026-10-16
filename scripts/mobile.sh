#!/usr/bin/env bash
# Запуск мобильного приложения на разных устройствах одной командой.
#
#   scripts/mobile.sh doctor            проверить окружение (Xcode, симуляторы, Android, бэкенд, сеть)
#   scripts/mobile.sh backend           поднять бэкенд на :8000 в фоне (миграции + демо-данные)
#   scripts/mobile.sh ios [устройство]  iOS-симулятор: имя или UDID; без аргумента выбирается сам
#   scripts/mobile.sh phone             реальный iPhone/Android через Expo Go по Wi-Fi (QR в терминале)
#   scripts/mobile.sh android           Android-эмулятор (или подключённое устройство по USB)
#   scripts/mobile.sh devices           список всех целей, на которых можно запустить
#
# DRY_RUN=1 только печатает, что будет запущено. PORT_API — порт бэкенда (по умолчанию 8000).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_PORT="${PORT_API:-8000}"
DRY="${DRY_RUN:-0}"
LOG_DIR="${TMPDIR:-/tmp}/movermate"
mkdir -p "$LOG_DIR"

ok()   { printf '  \033[32mOK\033[0m   %s\n' "$*"; }
warn() { printf '  \033[33mWARN\033[0m %s\n' "$*"; }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$*"; }
die()  { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }
run()  { if [ "$DRY" = 1 ]; then echo "[dry-run] $*"; else "$@"; fi; }

lan_ip() {
  local ip=""
  for i in en0 en1 en2 en3; do ip="$(ipconfig getifaddr "$i" 2>/dev/null || true)"; [ -n "$ip" ] && break; done
  [ -z "$ip" ] && ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  echo "$ip"
}

backend_up() { curl -fsS -m 2 "http://localhost:$API_PORT/api/health" >/dev/null 2>&1; }

# ---------- iOS: выбор устройства ----------
# Печатает "UDID<TAB>имя<TAB>состояние" для доступных iPhone/iPad; обычные модели раньше «странных» (Duo).
ios_devices() {
  xcrun simctl list devices available -j 2>/dev/null | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)["devices"]
except Exception:
    sys.exit(0)
rows = []
for runtime, devs in data.items():
    for d in devs:
        if not d.get("isAvailable", True):
            continue
        name = d["name"]
        if not (name.startswith("iPhone") or name.startswith("iPad")):
            continue
        weird = 1 if "Duo" in name else 0
        booted = 0 if d["state"] == "Booted" else 1
        rows.append((booted, weird, name, d["udid"], d["state"]))
rows.sort()
for _, _, name, udid, state in rows:
    print("%s\t%s\t%s" % (udid, name, state))
'
}

pick_ios_device() {  # $1 — имя или UDID (необязательно)
  local want="${1:-}" line
  if [ -n "$want" ]; then
    line="$(ios_devices | awk -F'\t' -v w="$want" '$1==w || $2==w {print; exit}')"
    [ -z "$line" ] && line="$(ios_devices | awk -F'\t' -v w="$want" 'index(tolower($2), tolower(w)) {print; exit}')"
  else
    line="$(ios_devices | head -n 1)"
  fi
  echo "$line"
}

ensure_backend() {
  if backend_up; then ok "бэкенд уже работает на :$API_PORT"; return 0; fi
  [ -x "$ROOT/backend/.venv/bin/uvicorn" ] || die "Нет окружения бэкенда: выполните make backend-setup"
  echo "Поднимаю бэкенд на :$API_PORT (лог: $LOG_DIR/backend.log)"
  if [ "$DRY" = 1 ]; then echo "[dry-run] alembic upgrade head && python -m app.seed && uvicorn :$API_PORT"; return 0; fi
  (
    cd "$ROOT/backend" || exit 1
    .venv/bin/alembic upgrade head >"$LOG_DIR/backend.log" 2>&1 && .venv/bin/python -m app.seed >>"$LOG_DIR/backend.log" 2>&1
    nohup .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port "$API_PORT" >>"$LOG_DIR/backend.log" 2>&1 &
  )
  for _ in $(seq 1 30); do backend_up && { ok "бэкенд запущен"; return 0; }; sleep 1; done
  die "Бэкенд не запустился, смотрите $LOG_DIR/backend.log"
}

ensure_node_modules() {
  [ -d "$ROOT/mobile/node_modules" ] || { echo "Ставлю зависимости приложения"; run npm --prefix "$ROOT/mobile" install; }
}

expo_start() {  # $1 — API URL; остальное — аргументы expo start
  local api="$1"; shift
  echo "Приложение будет ходить на $api"
  [ "$DRY" = 1 ] && { echo "[dry-run] EXPO_PUBLIC_API_URL=$api npx expo start $*"; return 0; }
  cd "$ROOT/mobile" || exit 1
  EXPO_PUBLIC_API_URL="$api" exec npx expo start "$@"
}

# ---------- команды ----------
cmd_doctor() {
  local fails=0
  echo "Окружение для запуска MoverMate"
  command -v node >/dev/null && ok "Node $(node --version)" || { bad "нет Node"; fails=1; }
  [ -d "$ROOT/mobile/node_modules" ] && ok "зависимости приложения установлены" || warn "нет mobile/node_modules (make mobile-setup)"
  [ -x "$ROOT/backend/.venv/bin/uvicorn" ] && ok "окружение бэкенда готово" || { bad "нет backend/.venv (make backend-setup)"; fails=1; }
  backend_up && ok "бэкенд отвечает на :$API_PORT" || warn "бэкенд не запущен (scripts/mobile.sh backend)"
  local ip; ip="$(lan_ip)"
  [ -n "$ip" ] && ok "IP в Wi-Fi: $ip (для реального телефона)" || warn "не нашёл IP локальной сети"

  echo "iOS"
  if xcodebuild -license check >/dev/null 2>&1; then ok "Xcode: лицензия принята"
  elif ! command -v xcodebuild >/dev/null; then bad "Xcode не установлен"; fails=1
  else bad "Xcode: лицензия не принята (sudo xcodebuild -license accept)"; fails=1; fi
  local devs; devs="$(ios_devices)"
  if [ -n "$devs" ]; then
    ok "iOS-устройств: $(echo "$devs" | wc -l | tr -d ' ')"
    echo "$devs" | awk -F'\t' '{printf "         - %s (%s)\n", $2, $3}'
    echo "$devs" | awk -F'\t' '$2 !~ /Duo/ {n++} END {exit n>0}' && warn "доступен только необычный iPhone Duo: поставьте другой iOS-рантайм (Xcode → Settings → Components)"
  else
    warn "нет ни одного iOS-симулятора (xcodebuild -downloadPlatform iOS)"
  fi
  command -v pod >/dev/null && ok "CocoaPods $(pod --version 2>/dev/null)" || warn "нет CocoaPods (нужен только для сборки в Xcode: brew install cocoapods)"

  echo "Android"
  if command -v adb >/dev/null; then
    ok "adb найден"; adb devices | awk 'NR>1 && $2=="device" {print "         - " $1}'
  else warn "нет adb/Android SDK (нужен только для Android-эмулятора)"; fi
  command -v emulator >/dev/null && ok "эмулятор Android найден" || warn "нет Android-эмулятора"
  return $fails
}

cmd_devices() {
  echo "iOS-симуляторы:"
  ios_devices | awk -F'\t' '{printf "  %-28s %-9s %s\n", $2, $3, $1}'
  echo "Реальный телефон: scripts/mobile.sh phone  (IP: $(lan_ip))"
  command -v adb >/dev/null && { echo "Android:"; adb devices | awk 'NR>1 && $2=="device" {print "  " $1}'; }
  return 0
}

cmd_ios() {
  command -v xcrun >/dev/null || die "Нужен Xcode"
  xcodebuild -license check >/dev/null 2>&1 || die "Не принята лицензия Xcode: sudo xcodebuild -license accept"
  local line udid name state; line="$(pick_ios_device "${1:-}")"
  if [ -z "$line" ]; then
    [ -n "${1:-}" ] && die "Устройство «$1» не найдено. Список: scripts/mobile.sh devices"
    die "Нет iOS-симуляторов. Установите: xcodebuild -downloadPlatform iOS (или Xcode → Settings → Components)"
  fi
  udid="$(echo "$line" | cut -f1)"; name="$(echo "$line" | cut -f2)"; state="$(echo "$line" | cut -f3)"
  echo "Устройство: $name ($udid)"
  case "$name" in *Duo*) warn "Это iPhone Duo: обычных моделей на этом рантайме нет" ;; esac
  ensure_backend
  ensure_node_modules
  [ "$state" = "Booted" ] || run xcrun simctl boot "$udid"
  expo_start "http://localhost:$API_PORT" --ios
}

cmd_phone() {
  local ip; ip="$(lan_ip)"
  [ -n "$ip" ] || die "Не нашёл IP локальной сети: подключите Mac к Wi-Fi"
  ensure_backend
  ensure_node_modules
  echo "Установите Expo Go на телефон (App Store / Google Play), подключите его к той же Wi-Fi сети и отсканируйте QR-код ниже."
  expo_start "http://$ip:$API_PORT" --lan
}

cmd_android() {
  command -v adb >/dev/null || die "Нет Android SDK (adb). Установите Android Studio или используйте: scripts/mobile.sh phone"
  adb devices | awk 'NR>1 && $2=="device" {found=1} END {exit !found}' \
    || die "Нет запущенного эмулятора или устройства. Запустите эмулятор в Android Studio и повторите"
  ensure_backend
  ensure_node_modules
  # эмулятор видит Mac как 10.0.2.2; для USB-устройства пробрасываем порт
  run adb reverse "tcp:$API_PORT" "tcp:$API_PORT" >/dev/null 2>&1
  expo_start "http://localhost:$API_PORT" --android
}

case "${1:-help}" in
  doctor)  cmd_doctor ;;
  devices) cmd_devices ;;
  backend) ensure_backend ;;
  ios)     shift; cmd_ios "${1:-}" ;;
  phone)   cmd_phone ;;
  android) cmd_android ;;
  *)       sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//' ;;
esac
