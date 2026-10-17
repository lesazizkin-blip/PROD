#!/usr/bin/env bash
# Включает AI на ВМ одной командой: ключ LLM-прокси Spirit + адрес и модель по умолчанию.
#   scripts/ai-setup.sh
# Работают сразу: персональный план при создании переезда, опись коробки по фото, раскладка комнаты по фото.
# Ключ вводится скрыто и уходит на ВМ через stdin ssh: его нет ни на экране, ни в истории, ни в аргументах.
# Модель должна понимать изображения (по умолчанию Claude Haiku 5.5 через openrouter в Spirit).
set -eu
VM="${DEPLOY_VM:-178.72.185.97}"
KEY="${VM_KEY:-$HOME/.ssh/vm1.pem}"
DIR=/opt/movermate/deploy
BASE_URL="${AI_BASE_URL:-https://llm-proxy.spirit.t-education.com/v1}"
MODEL="${AI_MODEL:-openrouter/anthropic/claude-haiku-5.5}"
# вторая модель для фото (тот же ключ Spirit): AI_VISION_MODEL=<id> scripts/ai-setup.sh
# без переменной уже заданная вторая модель на ВМ не меняется; не задана вовсе - фото идут в AI_MODEL
VISION_MODEL="${AI_VISION_MODEL:-}"

printf 'Ключ аккаунта LLM-прокси Spirit (символы не видны, Enter - оставить текущий): '
read -rs TOKEN || true
echo
printf '%s\n' "${TOKEN:-}" | ssh -i "$KEY" -o BatchMode=yes "root@$VM" "set -eu; cd $DIR
  read -r token || true
  touch .env; chmod 600 .env
  grep -v -e '^AI_BASE_URL=' -e '^AI_MODEL=' .env > .env.new || true
  if [ -n '$VISION_MODEL' ]; then grep -v '^AI_VISION_MODEL=' .env.new > .env.tmp || true; mv .env.tmp .env.new; printf 'AI_VISION_MODEL=%s\n' '$VISION_MODEL' >> .env.new; fi
  if [ -n \"\$token\" ]; then grep -v '^AI_API_KEY=' .env.new > .env.tmp || true; mv .env.tmp .env.new; printf 'AI_API_KEY=%s\n' \"\$token\" >> .env.new; fi
  printf 'AI_BASE_URL=%s\nAI_MODEL=%s\n' '$BASE_URL' '$MODEL' >> .env.new
  mv .env.new .env; chmod 600 .env
  grep -q '^AI_API_KEY=.' .env && echo 'Ключ на месте.' || echo 'ВНИМАНИЕ: ключа нет, AI останется выключенным.'
  docker compose up -d app >/dev/null"
unset TOKEN
echo "Готово: AI_BASE_URL=$BASE_URL, AI_MODEL=$MODEL${VISION_MODEL:+, AI_VISION_MODEL=$VISION_MODEL}, app перезапущен."
echo "Проверка: на сайте «Коробки» → «Комната по фото» или «Добавить вещи» → «Заполнить по фото»."
