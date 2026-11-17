#!/usr/bin/env bash
# backup-daily.sh — สำหรับ cron/Task Scheduler: pg_dump → ./backups/ → ลบ dump เก่า >14 วัน
# ใช้ได้ 2 แบบ: (1) host มี pg_dump + .env DATABASE_URL  (2) ไม่มี client → dump ผ่าน docker container
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p backups
OUT="backups/lottery-$(date +%Y%m%d-%H%M%S).dump"

if command -v pg_dump >/dev/null 2>&1; then
  set -a; [ -f .env ] && . ./.env; set +a
  ./scripts/backup-pg.sh "$OUT"
elif docker ps --format '{{.Names}}' | grep -q 'postgres'; then
  # dump ผ่าน postgres container (ไม่ต้องลง pg client บน host)
  C=$(docker ps --format '{{.Names}}' | grep 'postgres' | head -1)
  docker exec "$C" pg_dump -U "${POSTGRES_USER:-lottery}" -d "${POSTGRES_DB:-lottery}" -Fc > "$OUT"
  echo "[backup-daily] docker dump → $OUT ($(du -h "$OUT" | cut -f1))"
else
  echo "[backup-daily] ERROR: ไม่พบ pg_dump และไม่พบ postgres container" >&2
  exit 1
fi

find backups -name 'lottery-*.dump' -mtime +14 -delete 2>/dev/null || true
echo "[backup-daily] done $(date -Is)"
