#!/bin/bash
# Двойной щелчок: запускает сайт MoverMate и открывает его в браузере (Python 3 нужен, больше ничего).
# Закрыть сайт: Ctrl+C в этом окне или просто закройте окно.
cd "$(dirname "$0")" || exit 1
URL="http://localhost:${PORT:-8000}"
OPEN="${OPEN_CMD:-open}"

# Уже запущен: просто открываем
if curl -fsS -m 2 "$URL/api/health" >/dev/null 2>&1; then
  echo "Сайт уже работает: $URL"
  "$OPEN" "$URL"
  exit 0
fi

# Откроем браузер, как только сервер ответит
( for _ in $(seq 1 180); do
    curl -fsS -m 2 "$URL/api/health" >/dev/null 2>&1 && { "$OPEN" "$URL"; break; }
    sleep 1
  done ) &

echo "Запускаю MoverMate… при первом запуске это около минуты."
exec scripts/run-site.sh
