# Deploy — Production (Docker)

## ครั้งแรก

```bash
# 1. เตรียม env
cp .env.production.example .env
# แก้ .env: SESSION_SECRET (สุ่ม 64 hex), DOMAIN=โดเมนจริง

# 2. build + run
docker compose up -d --build

# 3. ดู log
docker compose logs -f app
```

- เว็บ: `https://<DOMAIN>` (Caddy ออก cert ให้อัตโนมัติ)
- health: `https://<DOMAIN>/api/health`

## อัปเดตเวอร์ชัน

```bash
git pull
docker compose up -d --build
# DB ไม่หาย — อยู่ใน volume lottery-data
```

## Backup (cron บน host)

```cron
# ทุกวัน 03:00 — สำรอง DB ออกมาที่ ./backups บน host
0 3 * * * cd /path/to/demo-lottery && docker compose exec -T app sh /app/scripts/backup-db.sh
```

mount `./backups` เพิ่มใน compose ถ้าต้องการเก็บนอก volume:
```yaml
volumes:
  - ./backups:/backups
```

## Restore

```bash
# หยุด app ก่อน
docker compose stop app
# copy backup เข้าไปใน container volume หรือ mount path
docker compose run --rm -v lottery-data:/app/server/data app sh -c "cp /backups/lottery-XXX.db /app/server/data/demo-lottery.db"
docker compose start app
```

## หมายเหตุ

- SQLite เหมาะกับผู้ใช้ระดับหลักร้อย — ถ้าจะ scale หลักพัน+ ค่อย migrate เป็น PostgreSQL (งานชิ้นใหญ่ ทำเป็น phase แยก)
- อย่า expose port 4000 ออก host — เข้าได้ทาง Caddy (HTTPS) เท่านั้น
- `SESSION_SECRET` เปลี่ยน = logout ทุกคน — เก็บไว้ดีๆ
