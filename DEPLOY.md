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

### ทางเลือก A — domain จริง (แนะนำสำหรับใช้ public)
1. มี domain → ชี้ DNS มาที่เครื่อง (A record → IP public ของเราเตอร์ + port-forward 80/443)
   หรือถ้าเครื่องอยู่หลัง NAT → ใช้ Cloudflare Tunnel / VPN
2. ตั้ง `DOMAIN=lottery.example.com` ใน `.env` → `docker compose up -d caddy`
   Caddy ออก Let's Encrypt cert อัตโนมัติ (port 80/443 ต้องเข้าถึงจาก internet)

### ทางเลือก B — domain ฟรี + HTTPS บน LAN (ไม่มี public IP)
เหมาะกับเครื่องอยู่ใน LAN/NAT — cert จริงจาก Let's Encrypt ผ่าน DNS-01 (ไม่ต้อง port-forward):

1. **สมัคร domain ฟรี**: https://login.us.kg (login ด้วย GitHub) → ได้ `xxx.us.kg`
   หรือ https://pp.ua (รออนุมัติ ~1 วัน)
2. **ย้าย DNS ไป Cloudflare** (ฟรี): dash.cloudflare.com → Add site → ใส่ domain →
   เปลี่ยน nameserver ที่ผู้ให้ domain ตามที่ CF แสดง → รอ active (นาที-ชม.)
3. สร้าง **API Token**: My Profile → API Tokens → Create Token →
   template "Edit zone DNS" → Zone Resources = domain ที่ใช้ → สร้างแล้ว copy token
4. หา **Account ID**: Cloudflare dashboard → คลิก domain → ดู URL หรือ sidebar
5. เพิ่มใน `.env`:
   ```
   DOMAIN=xxx.us.kg
   CF_API_TOKEN=<token>
   CF_ACCOUNT_ID=<account-id>
   ```
6. รัน: `bash scripts/setup-https.sh` — ออก cert → mount เข้า Caddy → patch Caddyfile → reload
7. **ให้ client resolve domain มาที่เครื่อง** — ตั้ง DNS ใน router ให้ `xxx.us.kg → 192.168.1.122`
   (หรือจอง IP เครื่องไว้ก่อน) แล้วเข้า `https://xxx.us.kg` ได้เลย — cert trusted ทุก browser

- renew: acme.sh cron ต่ออายุอัตโนมัติ + reload Caddy ผ่าน hook ที่ setup-https.sh ตั้งไว้
- ⚠️ HTTP ล้วน + cookie session = ไม่เหมาะกับข้อมูลเงินจริงข้าม internet — ต้องมี HTTPS ก่อนเปิดใช้จริง
