#!/usr/bin/env bash
# Записывает одну настройку в /opt/movermate/deploy/.env на ВМ и перезапускает app.
#   scripts/vm-env.sh MAPTILER_API_KEY        # ключ подсказок адреса MapTiler
#   scripts/vm-env.sh GOOGLE_MAPS_API_KEY     # или Google
# Значение вводится скрыто и уходит на ВМ через stdin ssh: его нет ни на экране, ни в истории, ни в аргументах.
# Пустое значение удаляет настройку.
set -eu
NAME="${1:?Укажите имя настройки, например MAPTILER_API_KEY}"
case "$NAME" in *[!A-Z0-9_]*) echo "Имя: только A-Z, 0-9 и _"; exit 1 ;; esac
VM="${DEPLOY_VM:-178.72.185.97}"
KEY="${VM_KEY:-$HOME/.ssh/vm1.pem}"
DIR=/opt/movermate/deploy

printf 'Значение %s (символы не видны, пусто - удалить) и Enter: ' "$NAME"
read -rs VALUE || true
echo
printf '%s\n' "${VALUE:-}" | ssh -i "$KEY" -o BatchMode=yes "root@$VM" "set -eu; cd $DIR
  exec 9>/run/movermate.lock; flock -w 120 9 || { echo 'Идёт выкатка или работа сторожа, повторите через пару минут'; exit 1; }
  read -r value || true
  touch .env; chmod 600 .env
  grep -v '^$NAME=' .env > .env.new || true
  [ -n \"\$value\" ] && printf '%s=%s\n' '$NAME' \"\$value\" >> .env.new
  mv .env.new .env; chmod 600 .env
  # перезапуск на образе, который работает сейчас: в .env может лежать устаревший APP_IMAGE
  img=\$(docker inspect -f '{{.Config.Image}}' deploy-app-1 2>/dev/null || true)
  if [ -n \"\$img\" ]; then APP_IMAGE=\"\$img\" docker compose up -d --no-build app >/dev/null; else docker compose up -d --no-build app >/dev/null; fi"
unset VALUE
echo "Готово: $NAME обновлён, app перезапущен."
if [ "$NAME" = MAPTILER_API_KEY ] || [ "$NAME" = GOOGLE_MAPS_API_KEY ]; then
  sleep 5
  curl -s "https://hack-led-20-vm1-12902f.vmaas-spirit.t-education.com/api/config" | grep -o '"maps_provider":[^,}]*' || true
fi
