#!/usr/bin/env bash
# Резервная копия базы MoverMate на ВМ: онлайн-копия SQLite (корректна и во время записи),
# проверка целостности копии, хранение последних KEEP копий.
#   deploy/backup.sh [метка]      # по cron раз в час; deploy:vm вызывает с меткой ci перед выкаткой
# Восстановление: docs/OPERATIONS.md, раздел «Копии базы и восстановление».
set -euo pipefail
CONTAINER="${CONTAINER:-deploy-app-1}"
DIR="${BACKUP_DIR:-/root/backups}"
KEEP="${KEEP:-48}"
TAG="${1:-hourly}"
mkdir -p "$DIR"
name="app-$(date +%Y%m%d-%H%M%S)-$TAG.db"

# копию делает сам SQLite внутри контейнера (backup API), затем забираем файл на ВМ
docker exec "$CONTAINER" python -c "
import sqlite3
src = sqlite3.connect('/data/app.db'); dst = sqlite3.connect('/data/backup-tmp.db')
src.backup(dst); dst.close(); src.close()"
docker cp "$CONTAINER:/data/backup-tmp.db" "$DIR/$name"
docker exec "$CONTAINER" rm -f /data/backup-tmp.db

# проверка, что из копии можно восстановиться: целостность и число проектов
check="$(python3 -c "
import sqlite3, sys
db = sqlite3.connect(sys.argv[1])
ok = db.execute('pragma integrity_check').fetchone()[0]
print(ok, db.execute('select count(*) from projects').fetchone()[0])" "$DIR/$name")"
if [ "${check%% *}" != "ok" ]; then
  echo "$(date -Is) ОШИБКА: копия $name повреждена ($check)"; rm -f "$DIR/$name"; exit 1
fi
echo "$(date -Is) копия $name: целостность ok, проектов ${check##* }"

# храним последние KEEP копий
ls -1t "$DIR"/app-*.db 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
