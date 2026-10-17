#!/bin/sh
# Сторож MoverMate: cron раз в минуту (/etc/cron.d/movermate-watchdog ставит пайплайн, deploy:vm).
# - контейнер app или caddy не запущен (упал, ВМ перезагрузилась, кто-то остановил) -> поднимаем стек;
# - app три проверки подряд «unhealthy» (завис, не отвечает на /api/health) -> перезапускаем app.
# Не вмешивается во время выкатки (flock) и обслуживания (файл .maintenance).
# Docker сам перезапускает только упавший процесс, зависший - нет; это и закрывает сторож.
cd "$(dirname "$0")" || exit 1
# обслуживание (восстановление базы и т. п.): `touch .maintenance` в этой папке - сторож не вмешивается
[ -f .maintenance ] && exit 0
# идёт выкатка из CI (она держит ту же блокировку) - ничего не трогаем, проверим через минуту
exec 9>/run/movermate.lock
flock -n 9 || exit 0
STATE=/var/tmp/movermate-unhealthy
for c in deploy-app-1 deploy-caddy-1; do
  if [ "$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null)" != "true" ]; then
    echo "$(date -Is) $c не запущен, поднимаю"
    # существующий контейнер запускаем как есть: тот же образ, без registry и сети; нет контейнера - compose
    docker start "$c" >/dev/null 2>&1 || docker compose up -d --no-build
    exit 0
  fi
done
if [ "$(docker inspect -f '{{.State.Health.Status}}' deploy-app-1)" = "unhealthy" ]; then
  n=$(( $(cat "$STATE" 2>/dev/null || echo 0) + 1 ))
  echo "$n" > "$STATE"
  if [ "$n" -ge 3 ]; then
    echo "$(date -Is) app нездоров $n минуты подряд, перезапускаю"
    docker restart deploy-app-1
    echo 0 > "$STATE"
  fi
else
  echo 0 > "$STATE"
fi
