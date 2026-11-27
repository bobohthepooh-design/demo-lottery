# AGENTS.md — คู่มือสำหรับ AI Agent / นักพัฒนา

> Demo Lottery Platform — เว็บแทงหวย/demo การศึกษา เครดิตเสมือน (virtual credit)
> **ยังไม่ใช่ระบบเงินจริง** — การชำระเงินจริงผ่าน PromptPay มีโครงสร้างแต่ต้องตัดสินใจ legal/KYC ก่อนเปิดจริง

## Stack

- **Backend**: Node.js ≥22.5 (ESM), Express 4, PostgreSQL 16 (`pg`), zod, helmet, express-rate-limit, csrf-csrf, vitest+supertest
- **Frontend**: React 18 + Vite + Tailwind (JSX ล้วน ไม่มี TS), lazy routes
- **Infra**: Docker Compose (app + postgres + caddy), Caddy TLS, `docker-compose.yml`
- **Auth**: DB session cookie (HttpOnly, SameSite=Lax) + CSRF double-submit HMAC, scrypt password, TOTP MFA (lib/totp.js — RFC6238 implement เอง), OTP phone/email (nodemailer), Turnstile (optional)

## Commands ที่ใช้จริง

```bash
# Dev (ต้องมี postgres — docker compose up -d postgres)
npm run dev            # concurrently server+client
npm --prefix server run dev     # server only (port 4000)
npm --prefix client run dev     # vite dev (port 5173)

# Build & deploy (วิธีที่ใช้จริงในโปรเจกต์นี้)
cd client && npm run build      # build frontend → client/dist
docker compose build app && docker compose up -d app   # rebuild+restart
docker compose logs -f app      # logs
curl http://localhost/api/health            # ผ่าน Caddy port 80
curl http://localhost/api/health?deep=1     # + DB check

# Test
npm --prefix server test        # vitest — ต้องตั้ง TEST_DATABASE_URL (ดู server/test/api.test.js หัวไฟล์)
node tests/smoke.mjs            # smoke API test (ต้องมี server รันอยู่)
./scripts/security-scan.sh      # gitleaks+semgrep+trivy ผ่าน docker (ดูด้านล่าง)
```

## Security scanning (DevSecOps)

- `scripts/security-scan.sh [gitleaks|semgrep|trivy|all]` — รัน scanners ผ่าน Docker images (ไม่ต้องติดตั้ง)
- CI (`.github/workflows/ci.yml`) มี 3 security jobs: gitleaks (full history), semgrep (ERROR severity), trivy fs+config (CRITICAL/HIGH)
- **กฎ**: ห้ามปิด/ลด severity เพื่อให้ pipeline ผ่าน — แก้ root cause หรือบันทึก justification ใน PROJECT_STATUS.md

## Conventions สำคัญ

### Backend
- Routes ใน `server/src/routes/*.js` — บางไฟล์ใช้ `router.use(requireAuth)` ทั้งไฟล์ (bets/scratch/hilo/kiwi/payments/notifications/chat-member)
- Business logic อยู่ใน `server/src/services/*Service.js` — route แค่ validate (zod) + เรียก service
- DB access ผ่าน `q()/qGet()/txAsync` จาก `server/src/db/pg.js` — **PostgreSQL syntax เท่านั้น** (`$1` params, `RETURNING`, `ON CONFLICT`)
- `created_at` เก็บเป็น **text** `'YYYY-MM-DD HH:MM:SS'` (UTC) — ใช้ `nowSql()` / `to_char(now() AT TIME ZONE 'UTC',...)` — ห้ามใช้ `datetime('now')` (SQLite legacy)
- Idempotency: ทุก mutation การเงินต้องรับ `idempotencyKey` — pattern: เช็ค dup ก่อน insert ใน transaction
- Error: `throw new HttpError(status, 'ข้อความไทย', 'CODE')` — code สำหรับ frontend branching
- Audit: `audit({userId, action, entityType, entityId, detail})` + `securityEvent(...)` สำหรับ security events
- ทุก mutation ต้องผ่าน CSRF (`x-csrf-token` header จาก `/api/csrf-token`) — POST/PUT/PATCH/DELETE เท่านั้น

### Frontend
- `client/src/api.js` — `api(path, {method, body})` จัดการ CSRF+cookie ให้อัตโนมัติ
- สกุลเงิน: เก็บเป็น **satang** (1฿=100) ใน backend — แสดงผลใช้ `satang()` จาก api.js → "1,234.50 บาท"
- ภาษา UI: **ไทยเป็นหลัก** — error messages จาก backend เป็นภาษาไทยอยู่แล้ว
- หน้า member: `/`, `/play` (แทงหวย), `/lotteries`, `/games`, `/wallet`, `/profile`
- หน้า admin: `/admin/*` (layout `client/src/admin/AdminLayout.jsx`) — เมนู + badge อยู่ที่นั่น
- Admin utilities (2026-11): `admin/useUrlFilters.jsx` (URL-persisted filters + `TablePager`), `components/AdminStates.jsx` (`AdminLoading`/`AdminError`), `lib/exportCsv.js` (BOM+escape+formula-guard), `admin/navConfig.js` (adminGroups กลาง — AdminLayout/CommandPalette/Layout import ร่วมกัน), `admin/CommandPalette.jsx` (Ctrl+K)

### Database
- Schema canonical: `server/src/db/schema.pg.sql` + migrations `server/src/db/migrations/*.sql` (marker + apply)
- เพิ่ม column/table → ต้องแก้ทั้ง schema.pg.sql + สร้าง migration file + apply เข้า DB จริง (dev: `docker exec demo-lottery-postgres-1 psql ...`)
- ห้ามลบ/แก้ migration เก่าที่ applied แล้ว — เพิ่มตัวใหม่เท่านั้น

## Security rules (ห้ามละเมิด)

- ห้ามใส่ secret ใน code/git — `.env` ถูก gitignore แล้ว; ห้าม commit `*.pem`, `certs/`, `backups/`
- ห้าม bypass `requireAuth`/`requirePerm`/`requireAgeConfirmed`
- ห้ามแก้ไข bet slip ที่ settled แล้ว — write-once, cancel ได้เฉพาะตอน draw ยังเปิด
- ห้ามให้ member เรียก `/bets/wallet/action` เมื่อ payments configured (server block แล้ว — ห้ามเอาออก)
- Dev OTP/email token echo (`devCode`/`devToken`) **อนุญาตเฉพาะ private/LAN IP** — ห้ามเปิดบน public
- `OTP_DEV_ECHO` ต้องปิดใน production public
- Admin สูงสุด 2 คน — `super_admin` + `admin` role เท่านั้นที่ควรมีสิทธิ์สูง; ทุก admin action ต้อง audit
- ก่อน commit: `node --check` ไฟล์ server ที่แก้ + `cd client && npm run build` ถ้าแตะ JSX (เคยพังเรื่อง nested div)

## Workflow ที่ใช้ได้ผล (จาก audit ก่อนหน้า)

1. อ่านโค้ดที่เกี่ยวข้องให้ครบก่อนแก้ (grep + read service+route คู่กัน)
2. แก้ → verify: syntax check → client build → docker rebuild → health check → API test จริงด้วย curl/node script
3. Commit ด้วย conventional message + trailer `Generated with [Devin]` + Co-Authored-By
4. **ห้าม deploy/เปลี่ยน production config โดยไม่บอก user** — แต่ build+restart container บนเครื่องนี้เป็นเรื่องปกติของ workflow
5. ถ้าแตะ payment/wallet/bet → ต้องคิดถึง idempotency + audit + ledger consistency เสมอ

## Test users / data

- admin: `admin` / (SEED_ADMIN_PASSWORD หรือ default — เปลี่ยนแล้ว) + MFA required
- DB access: `docker exec demo-lottery-postgres-1 psql -U lottery -d lottery`
- App logs: `docker logs demo-lottery-app-1` หรือ `docker compose logs -f app`

## Known pitfalls

- Port 4000 **ไม่ bind ออก host** — ทดสอบผ่าน `http://localhost` (Caddy:80) หรือ `docker exec` เข้า container
- `docker exec -w` ต้อง absolute path; import service ใน container: `node --input-type=module -e "const m=await import('/app/server/src/services/x.js')"` (workdir /app/server)
- Git Bash + docker -v: ต้อง `MSYS_NO_PATHCONV=1` + path แบบ `C:/...` (มีใน security-scan.sh แล้ว)
- Cookie jar ใน test script ต้องเก็บ `dl_session` + `dl_csrf` แยกกัน อย่าให้ทับ
