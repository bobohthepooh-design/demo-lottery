# Demo Lottery Platform

ระบบจำลองการจัดการหวยไทย / หวยลาว / หวยฮานอย — ** DEMO ONLY ใช้ Virtual Credit เท่านั้น ไม่มีการเชื่อมต่อเงินจริงหรือ Payment Gateway**

## Tech Stack

- **Backend:** Node.js + Express.js (ESM) + `node:sqlite` (SQLite ในตัว Node — ไม่ต้องติดตั้ง DB แยก)
- **Frontend:** React 18 + Vite + Tailwind CSS 4 + React Router 7
- **Auth:** Session cookie (HttpOnly) + scrypt password hashing + TOTP MFA สำหรับ Admin
- **Security:** helmet, rate-limit, CSRF double-submit (HMAC), RBAC, zod validation, audit log

## Quick Start

```powershell
# 1. ติดตั้ง dependencies (ครั้งแรก)
npm run install:all

# 2. ตั้งค่า environment
copy .env.example .env
# แก้ SESSION_SECRET: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Migrate + Seed (สร้าง schema และ super admin)
npm run migrate
npm run seed
npm run demo:data   # สร้างรอบหวยตัวอย่างที่เปิดรับได้ทันที (ทุก category)
npm run seed:rules  # (re)seed กติการางรางวัลตามโครงสร้างจริงของแต่ละประเทศ
# default: admin / Admin@Demo123  (เปลี่ยนทันทีหลัง login แรก!)

# 4. รัน (development: server :4000 + client :5173)
npm run dev
```

- เปิด http://localhost:5173 (dev) หรือ build แล้วรัน `npm start` → http://localhost:4000 (serve static)

## บัญชีเริ่มต้น

| Role | Username | Password | MFA |
|---|---|---|---|
| Super Admin | `admin` | `Admin@Demo123` | ต้องตั้งค่า TOTP ในหน้า Profile หลัง login แรก (seed ครั้งแรก `mfa_enabled=0` — Admin API จะเรียก `/auth/mfa/setup` → enable → login ใหม่ → verify) |

## Member Flow

1. สมัครสมาชิก → ได้เครดิตเริ่มต้น (default 100.00 บาท = 10000 สตางค์)
2. ดูรอบหวย `/lotteries` → เลือกรอบที่ status = open
3. เลือกประเภท (2 ตัวบน/ล่าง, 3 ตัวบน/โต๊ด, วิ่งบน/ล่าง) + ใส่เลข + จำนวนเงิน → เพิ่มลงโพย
4. ยืนยันส่งโพย → ระบบหักเครดิตใน transaction เดียว (atomic)
5. Admin ออกผลที่ `/admin/settle` → ระบบคำนวณตาม `lottery_rules.match_config` และจ่ายเครดิตอัตโนมัติ
6. ดูผลที่ `/results`, โพยที่ `/my-bets`, เครดิตที่ `/wallet`

## Admin Flow

- `/admin` — Dashboard ภาพรวม
- `/admin/members` — จัดการสมาชิก (status, reset password)
- `/admin/roles` — RBAC matrix (Super Admin เท่านั้นแก้ได้)
- `/admin/lotteries` — ประเภทหวย + ตารางกติกา (match_config, payout)
- `/admin/draws` — สร้างรอบ, เปิด/ปิด/ยกเลิกรอบ
- `/admin/settle` — ออกผลรางวัล (winning_numbers JSON เช่น `{"top3":"123","bottom2":"45"}`)
- `/admin/wallet` — ปรับเครดิต (ต้องระบุเหตุผล + idempotency key)
- `/admin/bets` `/admin/reports` `/admin/audit` `/admin/security` `/admin/settings`

## กติกาคำนวณผล (match_config)

เก็บใน `lottery_rules.match_config` (JSON) — engine อ่านจาก DB เท่านั้น:

```json
{"source": "top3", "mode": "tail"}          // 3 ตัวบน: 3 หลักท้ายของ top3
{"source": "top3", "mode": "sorted"}       // 3 ตัวโต๊ด: สลับหลักได้
{"source": "bottom2", "mode": "tail"}      // 2 ตัวล่าง
{"source": "top3", "mode": "digit_contains"} // วิ่งบน: หลักเดียวที่ปรากฏในผล
```

`source` อ้าง field ใน `winning_numbers` JSON ของผลรางวัล
`payout_multiplier` = ตัวคูณยอดคืนรวมเงินต้น (เช่น 100 = ได้คืน 100 เท่าของยอดแทง)

## Test

```powershell
npm test          # vitest — 12 integration tests (auth, RBAC, CSRF, bet, settle, wallet)
npm audit         # dependency scan
```

## Backup / Restore

```powershell
# Backup (server หยุดหรือไม่ก็ได้ — WAL mode)
copy server\data\demo-lottery.db backup.db
copy server\data\demo-lottery.db-wal backup.db-wal   # ถ้ามี

# Restore
copy backup.db server\data\demo-lottery.db
```

## Security Checklist (DEMO)

- [x] Password: scrypt (N=16384,r=8,p=1) — ไม่เก็บ plain text
- [x] Session: HttpOnly + SameSite=Lax cookie, server-side session table, expiry
- [x] MFA TOTP บังคับสำหรับ admin API (mfa_verified flag ใน session)
- [x] RBAC: permission-based middleware ทุก admin route
- [x] CSRF: HMAC-signed double-submit token บน mutating requests
- [x] Rate limit: global + login limiter + account lockout (5 ครั้ง → ล็อก 15 นาที)
- [x] Security headers: helmet
- [x] Input validation: zod ทุก endpoint
- [x] SQL injection: parameterized queries ทั้งหมด (node:sqlite prepared statements)
- [x] XSS: React escaping + JSON API
- [x] Wallet: DB transaction + optimistic lock (version) + idempotency_key unique + balance>=0 CHECK
- [x] Audit log + security_events ทุก action สำคัญ
- [x] Error handling: ไม่รั่ว stack trace/DB error ให้ client
- [ ] HTTPS: จำเป็นเมื่อ deploy จริง (ใส่ reverse proxy เช่น Caddy/Nginx)
- [ ] เปลี่ยน SESSION_SECRET และ SEED_ADMIN_PASSWORD ใน production

## Project Structure

```
server/src/
  config.js            # env config
  db/                  # connection, migrations, seed
  lib/                 # password(scrypt), totp, audit
  middleware/          # csrf, rbac, errorHandler
  services/            # authService, lotteryService(engine), walletService, settingsService
  routes/              # auth, lottery, bets, admin
client/src/
  pages/               # member pages (ไทย)
  admin/               # admin pages
  api.js auth.jsx      # API client + auth context
scripts/smoke.mjs      # manual smoke test
server/test/api.test.js # vitest integration tests
docs/ARCHITECTURE.md docs/DATABASE.md
```
