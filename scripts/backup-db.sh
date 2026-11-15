#!/usr/bin/env bash
# Backup SQLite database — ใช้ใน cron: 0 3 * * * /path/to/scripts/backup-db.sh
set -euo pipefail

DATA_DIR="${DATA_DIR:-/app/server/data}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
DB="$DATA_DIR/demo-lottery.db"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/lottery-$STAMP.db"

mkdir -p "$BACKUP_DIR"

# sqlite3 .backup = safe online backup (ไม่ lock DB ขณะเขียน)
if command -v sqlite3 >/dev/null; then
  sqlite3 "$DB" ".backup '$OUT'"
else
  # fallback: sqlite3 ผ่าน node:sqlite (online mode WAL)
  node -e "
    const {DatabaseSync}=require('node:sqlite');
    const db=new DatabaseSync('$DB');
    db.exec(\"VACUUM INTO '$OUT'\");
    db.close();
  "
fi

# เก็บย้อนหลัง 14 วัน
find "$BACKUP_DIR" -name 'lottery-*.db' -mtime +14 -delete

echo "backup -> $OUT"
