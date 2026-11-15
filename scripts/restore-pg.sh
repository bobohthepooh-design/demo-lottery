#!/usr/bin/env bash
# restore-pg.sh — restore PostgreSQL จาก dump (⚠️ overwrite ข้อมูลทั้งหมดใน DB เป้าหมาย)
# ใช้: PGPASSWORD=xxx ./scripts/restore-pg.sh backups/lottery-XXXX.dump
set -euo pipefail

DUMP="${1:?usage: restore-pg.sh <dump-file>}"
[ -f "$DUMP" ] || { echo "ไม่พบไฟล์: $DUMP"; exit 1; }

if [ -n "${DATABASE_URL:-}" ]; then
  # pg_restore รับ connection string เป็น dbname ได้โดยตรง
  pg_restore "$DATABASE_URL" --clean --if-exists --no-owner "$DUMP"
else
  pg_restore -U "${PGUSER:-lottery}" -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-5432}" \
    -d "${PGDATABASE:-lottery}" --clean --if-exists --no-owner "$DUMP"
fi

echo "[restore-pg] restored ← $DUMP"
