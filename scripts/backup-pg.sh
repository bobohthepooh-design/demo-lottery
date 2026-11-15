#!/usr/bin/env bash
# backup-pg.sh — สำรอง PostgreSQL เป็น custom-format dump
# ใช้: ./scripts/backup-pg.sh [output-file]
# ค่า CONNECTION: ใช้ env DATABASE_URL หรือ ~/.pgpass / psql ปกติ
set -euo pipefail

OUT="${1:-backups/lottery-$(date +%Y%m%d-%H%M%S).dump}"
mkdir -p "$(dirname "$OUT")"

if [ -n "${DATABASE_URL:-}" ]; then
  pg_dump "$DATABASE_URL" -Fc -f "$OUT"
else
  # fallback: อ่านจาก env แยกหรือ psql default
  pg_dump -U "${PGUSER:-lottery}" -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-5432}" \
    -d "${PGDATABASE:-lottery}" -Fc -f "$OUT"
fi

echo "[backup-pg] saved → $OUT ($(du -h "$OUT" | cut -f1))"
