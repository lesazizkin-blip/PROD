#!/usr/bin/env bash
# Подготовка чистого Ubuntu/Debian-сервера под деплой из GitHub Actions. Запускать от root:
#   curl -fsSL https://raw.githubusercontent.com/<вы>/<репо>/main/scripts/bootstrap-server.sh | bash -s -- "<ПУБЛИЧНЫЙ SSH-КЛЮЧ>"
# (репозиторий приватный - проще скопировать файл на сервер через scp и запустить: bash bootstrap-server.sh "<ключ>")
# Проверено в контейнере Ubuntu 24.04 (пользователь, ключ, группа docker); установка Docker и ufw на реальном сервере не проверялись.
set -euo pipefail

PUBKEY="${1:-}"
[ -n "$PUBKEY" ] || { echo "Передайте публичный SSH-ключ первым аргументом"; exit 1; }

apt-get update -y
apt-get install -y ca-certificates curl ufw

# Docker (официальный установочный скрипт; включает compose-плагин)
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh

# Пользователь для деплоя: доступ по ключу и право запускать docker
id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
grep -qF "$PUBKEY" /home/deploy/.ssh/authorized_keys 2>/dev/null || echo "$PUBKEY" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

# Файрвол: SSH, HTTP, HTTPS (пропустить: SKIP_FIREWALL=1; на хостингах со своим файрволом он не нужен)
if [ -z "${SKIP_FIREWALL:-}" ]; then
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
fi

echo "Готово. В GitHub: DEPLOY_USER=deploy, DEPLOY_HOST=<IP сервера>, DEPLOY_SSH_KEY=<приватный ключ>."
