#!/usr/bin/env bash
# Restore database — หยุด app ก่อน, แล้วรัน: ./restore-db.sh /backups/lottery-YYYYMMDD-HHMMSS.db
set -euo pipefail

SRC="${1:?usage: restore-db.sh <backup-file>}"
DATA_DIR="${DATA_DIR:-/app/server/data}"
DB="$DATA_DIR/demo-lottery.db"

[ -f "$SRC" ] || { echo "ไม่พบไฟล์: $SRC"; exit 1; }

cp "$DB" "$DB.bak-$(date +%Y%m%d-%H%M%S)"   # กันพลาด — เก็บของเดิมไว้ก่อน
cp "$SRC" "$DB"
echo "restore เสร็จ: $SRC -> $DB (backup เดิมอยู่ที่ $DB.bak-*)"
echo "อย่าลืม restart app: docker compose restart app"
