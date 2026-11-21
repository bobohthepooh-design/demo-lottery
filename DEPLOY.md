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
# DB อยู่ใน postgres volume — ไม่หาย
```

## Backup (cron บน host)

DB คือ PostgreSQL (service `postgres` ใน compose, bind `127.0.0.1:5432`)
ใช้ `scripts/backup-daily.sh` — source `.env` แล้วรัน `pg_dump` ออกมาเก็บที่ `./backups/` (ลบอัตโนมัติ >14 วัน)

```cron
# ทุกวัน 03:00 — pg_dump ออกมาที่ ./backups บน host
0 3 * * * /path/to/demo-lottery/scripts/backup-daily.sh >> /path/to/demo-lottery/backups/backup.log 2>&1
```

Windows: ใช้ Task Scheduler ชี้ไปที่ `scripts/backup-daily.sh` (ผ่าน Git Bash/WSL) หรือ `scripts/backup-pg.sh` ตรงๆ
อย่า commit `backups/` — เพิ่มใน .gitignore แล้ว

## Restore

```bash
# restore PostgreSQL จาก dump (⚠️ overwrite ข้อมูลทั้งหมดใน DB เป้าหมาย)
set -a; . ./.env; set +a          # โหลด DATABASE_URL/POSTGRES_PASSWORD
./scripts/restore-pg.sh backups/lottery-XXXX.dump
docker compose restart app        # ไม่จำเป็นต้อง stop app แต่แนะนำตอน activate
```

ทดสอบความสมบูรณ์ของ dump โดยไม่ restore: `pg_restore -l backups/lottery-XXXX.dump | head`

## หมายเหตุ

- DB คือ PostgreSQL (service `postgres` ใน compose) — migrate เสร็จแล้ว, SQLite legacy ไม่ใช้
- อย่า expose port 5432 ออก host (bind `127.0.0.1` ไว้แล้ว) และ port 4000 (ให้เข้าผ่าน Caddy เท่านั้น)
- `SESSION_SECRET` เปลี่ยน = logout ทุกคน — เก็บไว้ดีๆ
- `OTP_DEV_ECHO` ถูกบังคับปิดใน production เสมอ (config.js) — OTP ไม่มี SMS จริง ห้ามเปิด public
- Admin คนแรก: `admin` / `Admin@Demo123` — เปลี่ยนรหัสผ่านและตั้ง TOTP ทันทีหลัง deploy
- Responsible gambling: สมาชิกต้องยืนยันอายุ 18+ ก่อนเดิมพัน/เล่นเกม (ทุก route สร้างโพยถูก gate แล้ว)
- ผลรางวัล: ไทย=GLO ทางการ, ฮานอย=XSMB/lotterychecks (แหล่งภายนอกไม่เป็นทางการ), ลาว=admin กรอกเอง — demo/gen ถูก label `source='demo'` หรือ `(gen)` ชัดเจน
- Lottery draws ทุกตลาดฮานอยไม่ออกรางวัลวันอาทิตย์ — ระบบสร้างรอบเฉพาะ จ.–ส.
- ถ้าต้องการ scale หลาย instance: ย้าย scheduler (auto-settle/cashback) ไป advisory lock + session store ไป Redis (ยังเป็น single-instance design)
- ติดตั้ง backup cron จริง: `crontab -e` แล้ววางบรรทัดในหัวข้อ Backup ด้านบน

## HTTPS

- **มี domain จริง** → ตั้ง `DOMAIN=lottery.example.com` ใน `.env` แล้ว `docker compose up -d caddy`
  Caddy จะออก Let's Encrypt cert ให้อัตโนมัติ (port 80/443 ต้องเข้าถึงจาก internet ได้)
- **ไม่มี domain / ใช้ใน LAN** → ใช้ `http://<LAN-IP>` ตามเดิม (Caddy มี `{$LAN_IP}` + `tls internal` สำรองสำหรับ https://IP แต่ browser จะเตือน cert)
- ⚠️ HTTP ล้วน + cookie session = ไม่เหมาะกับข้อมูลเงินจริงข้าม internet — ต้องมี HTTPS ก่อนเปิดใช้จริง
- ถ้าเครื่องอยู่หลัง NAT/เราเตอร์ → ต้อง port-forward 80/443 ที่เราเตอร์ หรือใช้ tunnel (cloudflared/ngrok) แทน
