#!/usr/bin/env bash
# Включает отправку логов приложения в Sage на ВМ: записывает адрес Logs Collector и токен
# в /opt/movermate/deploy/.env и перезапускает контейнер app.
#   scripts/sage-setup.sh
# Токен спрашивается скрытым вводом и уходит на ВМ через stdin ssh: его нет ни на экране, ни в истории
# терминала, ни в аргументах команд. Нужен ключ ВМ ~/.ssh/vm1.pem.
set -eu
VM="${DEPLOY_VM:-178.72.185.97}"
KEY="${VM_KEY:-$HOME/.ssh/vm1.pem}"
GROUP="${SAGE_GROUP:-hack-led-20}"
DIR=/opt/movermate/deploy

say() { printf '\033[1m%s\033[0m\n' "$*"; }
vm() { ssh -i "$KEY" -o BatchMode=yes "root@$VM" "$@"; }

# хост подтвердили организаторы 17.10: https://<host>/api/<группа Sage>/multiline/
DEFAULT_HOST=sage.spirit.t-education.com
printf 'Хост Logs Collector [%s]: ' "$DEFAULT_HOST"
read -r HOST || true
HOST="${HOST:-$DEFAULT_HOST}"
HOST="${HOST#https://}"; HOST="${HOST#http://}"; HOST="${HOST%%/*}"
case "$HOST" in *[!A-Za-z0-9.-]*) echo "Хост «$HOST» похож на ошибку ввода. Запустите скрипт снова и на вопросе о хосте просто нажмите Enter."; exit 1 ;; esac
[ -n "$HOST" ] || { echo "Пусто: узнайте хост коллектора в Spirit или у организаторов."; exit 1; }
URL="https://$HOST/api/$GROUP/multiline/"

printf 'Токен Sage (символы не видны) и Enter: '
read -rs TOKEN || true
echo
[ -n "${TOKEN:-}" ] || { echo "Пусто. Скопируйте токен и запустите скрипт ещё раз."; exit 1; }

say "Проверяю токен на коллекторе (одна тестовая запись в группу $GROUP)…"
TS="$(date -u +%Y-%m-%dT%H:%M:%S.000+00:00)"
LINE="{\"@timestamp\":\"$TS\",\"env\":\"production\",\"system\":\"movermate\",\"inst\":\"sage-setup\",\"level\":\"INFO\",\"msg\":\"sage-setup check\"}"
CODE="$(printf 'Authorization: JWT %s\n' "$TOKEN" | curl -sS -m 20 -o /dev/null -w '%{http_code}' -H @- \
  -H 'Content-Type: application/x-ndjson' --data-binary "$LINE" "$URL" || echo 000)"
case "$CODE" in
  2??) say "Коллектор принял запись ($CODE)." ;;
  401|403) echo "Коллектор ответил $CODE: токен не подходит или у него нет прав на группу $GROUP. На ВМ ничего не записано."; exit 1 ;;
  *) echo "Коллектор ответил $CODE (адрес $URL). Проверьте хост. На ВМ ничего не записано."; exit 1 ;;
esac

say "Записываю настройки на ВМ и перезапускаю app…"
# значения передаются через stdin, а не в аргументах ssh
printf '%s\n%s\n' "$URL" "$TOKEN" | vm "set -eu; cd $DIR
  read -r url; read -r token
  touch .env; chmod 600 .env
  grep -v -e '^SAGE_LOGS_URL=' -e '^SAGE_API_KEY=' .env > .env.new || true
  printf 'SAGE_LOGS_URL=%s\nSAGE_API_KEY=%s\n' \"\$url\" \"\$token\" >> .env.new
  mv .env.new .env; chmod 600 .env
  docker compose up -d app >/dev/null"
unset TOKEN

say "Жду старта приложения…"
for _ in $(seq 1 30); do
  if vm "docker logs --since 2m deploy-app-1 2>&1 | grep -q '\"sage_appender\": true'"; then
    say "Готово: аппендер включён. Поиск в Sage: group=\"$GROUP\" system=\"movermate\""
    exit 0
  fi
  sleep 2
done
echo "Приложение не сообщило о включённом аппендере. Посмотрите: ssh -i $KEY root@$VM 'docker logs --tail 50 deploy-app-1'"
exit 1
