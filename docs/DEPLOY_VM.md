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
