#!/usr/bin/env bash
# restore-pg.sh — restore PostgreSQL จาก dump (⚠️ overwrite ข้อมูลทั้งหมดใน DB เป้าหมาย)
# ใช้: PGPASSWORD=xxx ./scripts/restore-pg.sh backups/lottery-XXXX.dump
# ใช้ได้ 2 แบบ: (1) host มี pg_restore + DATABASE_URL  (2) ไม่มี client → restore ผ่าน docker container
set -euo pipefail

DUMP="${1:?usage: restore-pg.sh <dump-file>}"
[ -f "$DUMP" ] || { echo "ไม่พบไฟล์: $DUMP"; exit 1; }

if command -v pg_restore >/dev/null 2>&1; then
  if [ -n "${DATABASE_URL:-}" ]; then
    pg_restore "$DATABASE_URL" --clean --if-exists --no-owner "$DUMP"
  else
    pg_restore -U "${PGUSER:-lottery}" -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-5432}" \
      -d "${PGDATABASE:-lottery}" --clean --if-exists --no-owner "$DUMP"
  fi
  echo "[restore-pg] restored ← $DUMP"
elif docker ps --format '{{.Names}}' | grep -q 'postgres'; then
  C=$(docker ps --format '{{.Names}}' | grep 'postgres' | head -1)
  docker cp "$DUMP" "$C:/tmp/restore.dump"
  docker exec "$C" pg_restore -U "${POSTGRES_USER:-lottery}" -d "${POSTGRES_DB:-lottery}" \
    --clean --if-exists --no-owner /tmp/restore.dump
  docker exec "$C" rm -f /tmp/restore.dump
  echo "[restore-pg] restored ← $DUMP (via $C)"
else
  echo "ERROR: ไม่พบ pg_restore และไม่พบ postgres container" >&2
  exit 1
fi
