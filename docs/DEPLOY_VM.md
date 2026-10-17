# Наш деплой на виртуальную машину (Spirit VMaaS)

**Адрес:** https://hack-led-20-vm1-12902f.vmaas-spirit.t-education.com (ВМ `vm1`, IP 178.72.185.97, Ubuntu 24.04, Docker и compose уже установлены).
HTTPS: сертификат Let's Encrypt получает и продлевает Caddy сам; `http` перенаправляется на `https`. Порты 22, 80, 443, 8000–8100 открыты в группе «Сетевые доступы».

## Что запущено
`/opt/movermate/deploy/docker-compose.yml`: два контейнера.
- `app`: сайт и API в одном образе (`Dockerfile` в корне), SQLite в томе `movermate-data`, демо-проект загружается при старте (`SEED_DEMO=true`);
- `caddy`: принимает 80 и 443, проксирует на `app:8000`. Сертификаты лежат в томе `caddy-data`: том нельзя удалять (лимиты Let's Encrypt).

Имя сервера для HTTPS задаётся в `/opt/movermate/deploy/.env` (`SITE_ADDRESS`), образец: `deploy/.env.example`.

## Передеплой вручную (с компьютера, где есть ключ ВМ)
Ключ ВМ скачивается на странице ВМ в Spirit (кнопка копирования у поля «SSH ключ») и кладётся в `~/.ssh/vm1.pem` с правами 600. В репозиторий его **нельзя** коммитить.

```bash
rsync -az --delete -e "ssh -i ~/.ssh/vm1.pem" \
  --exclude=.git --exclude=docs --exclude=node_modules --exclude=dist \
  --exclude=.venv --exclude='*.db' --exclude=.env --exclude=__pycache__ \
  ./ root@178.72.185.97:/opt/movermate/
ssh -i ~/.ssh/vm1.pem root@178.72.185.97 'cd /opt/movermate/deploy && docker compose up -d --build'
scripts/preflight.sh https://hack-led-20-vm1-12902f.vmaas-spirit.t-education.com
```

`--exclude=.env` оставляет на ВМ файл `deploy/.env`. База (том) при пересборке сохраняется.

## Проверка
```bash
scripts/preflight.sh https://hack-led-20-vm1-12902f.vmaas-spirit.t-education.com
ssh -i ~/.ssh/vm1.pem root@178.72.185.97 'docker ps; docker logs --tail 50 deploy-app-1'
```

## Автодеплой из GitLab
Основной путь. Пайплайн `.gitlab-ci.yml` (шаблон организаторов) на каждое слияние в `master` собирает образ в Spirit Registry, копирует базу в `/root/backups` и обновляет на этой ВМ только контейнер `app`, затем прогоняет `preflight.sh` (`docs/GITLAB.md`). Работает с 17.10 (пайплайн 11105). Ручной передеплой выше остаётся запасным путём.

## Резервные копии
- `deploy/backup.sh` делает онлайн-копию SQLite через backup API (корректна и во время записи), проверяет `pragma integrity_check` и число проектов, хранит последние 48 копий в `/root/backups` (`app-<дата>-<метка>.db`).
- Запуск: каждый час по cron (`/etc/cron.d/movermate-backup`, лог `/var/log/movermate-backup.log`) и перед каждой выкаткой из CI (метка `ci`). Cron и скрипт ставит задание `deploy:vm`.
- Восстановление из копии:
```bash
ssh -i ~/.ssh/vm1.pem root@178.72.185.97
cd /opt/movermate/deploy && ls -1t /root/backups | head        # выбрать копию
docker compose stop app
docker cp /root/backups/<копия>.db deploy-app-1:/data/app.db
docker compose start app
```
Затем с компьютера: `scripts/preflight.sh https://hack-led-20-vm1-12902f.vmaas-spirit.t-education.com`.

## Заголовки безопасности
Caddy добавляет `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (камера только для самого сайта) и скрывает заголовок `Server`. `preflight.sh` проверяет их на HTTPS-адресе; при выкатке Caddy перечитывает `Caddyfile` (`caddy reload`).

