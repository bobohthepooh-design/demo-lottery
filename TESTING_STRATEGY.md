# Testing Strategy

> ทุกตัวเลขคือของจริงที่รันผ่านแล้ว — อย่าอ้างตัวเลขที่ไม่ได้วัด

## Pyramid

```
        ┌─────────────┐
        │  e2e smoke  │  tests/smoke.mjs (CI job `e2e`)
        │  (1 flow)   │  register→games→bets→wallet guards
        ├─────────────┤
        │  API integ. │  server/test/*.test.js — vitest+supertest+Postgres จริง
        ├─────────────┤
        │  unit       │  server lib tests + client vitest (jsdom)
        └─────────────┘
        manual: tests/load.mjs, scripts/oneoff/*
```

## Server (`server/`)

| File | ครอบคลุม | DB |
|---|---|---|
| `unit.test.js` | lib utilities (password/totp/secretBox/etc) | ไม่ต้อง |
| `api.test.js` | auth/register/OTP/login/session, bets, lottery, wallet guards, RBAC | TEST_DATABASE_URL |
| `payments.test.js` | deposit min/QR, slip→pending_review, admin approve→ledger ครั้งเดียว, withdraw limits/reject, USE_PAYMENTS guard | TEST_DATABASE_URL |
| `haveibeenpwned.test.js` | HIBP lib: suffix match, fail-open paths (inject fetch) | ไม่ต้อง |

**Run**: `cd server && TEST_DATABASE_URL=postgres://... npx vitest run`
- ไฟล์รันขนานบน DB เดียวกันได้ปลอดภัย — migrate/seed ใช้ `pg_advisory_lock` แล้ว
- Test env ต้อง hermetic: `HIBP_CHECK=false`, `PROMPTPAY_ID=''` (api.test) ฯลฯ — ห้ามพึ่ง external network

## Client (`client/`)

| File | ครอบคลุม |
|---|---|
| `src/bettingWindow.test.js` | window parity กับ server, isBettingOpen, sourceBadge/kindBadge, cn |
| `src/components/Countdown.test.jsx` | component render + fake timers (jsdom) |

**Run**: `cd client && npm test` (vitest 5, jsdom สำหรับ .jsx)

## E2E (`tests/smoke.mjs`)

- 26 assertions: health→csrf→register→login→public config→instant games (idempotent)→bet+cancel→wallet deposit/withdraw→notifications
- รันใน CI job `e2e` กับ postgres service + server จริง (auto migrate+seed)
- Local: `BASE_URL=http://localhost:4199 node tests/smoke.mjs`
- **ข้อจำกัด**: ต้องมี draw ที่อยู่ใน betting window (เลือกอัตโนมัติตามกฎ client) และเครดิตพอ (CI ตั้ง INITIAL_CREDIT=100000); IP เดียวกันสมัคร >3 บัญชี/7 วัน จะไม่ได้เงินเริ่มต้น (promo-abuse guard) — รันซ้ำบนเครื่องเดียวกันอาจ fail ตรงนี้ ซึ่งเป็น intended behavior

## Load (`tests/load.mjs`)

- `BASE_URL=... DURATION=15 CONCURRENCY=20 node tests/load.mjs`
- วัด RPS + p50/p95/p99 + แยก 429 (rate-limit) ออกจาก error — ใช้เช็ค regression ไม่ใช่ gate
- Baseline ล่าสุด: ~1,667 RPS, p50 2.5ms (5 conc) — rate limiter ทำงานถูก

## CI gates (`.github/workflows/ci.yml`)

| Job | Gate |
|---|---|
| test | vitest server+client ต้องผ่านหมด + `npm audit --audit-level=high` ×3 |
| e2e | smoke.mjs ต้องผ่าน |
| gitleaks | 0 secrets ใน history |
| semgrep | 0 findings severity ERROR |
| trivy | 0 CRITICAL/HIGH (vuln+secret fs, config IaC) |

## กฎการเพิ่ม test

1. **Feature ใหม่ = test ก่อนหรือพร้อมกัน** (TDD สำหรับ bugfix/behavior change)
2. Bug fix ต้องมี failing test ที่ reproduce ก่อนแก้
3. Test ต้อง hermetic — ห้ามยิง external API จริง (HIBP/SlipOK mock หรือ inject)
4. อย่าแก้ test ให้ผ่านโดยอ่อน assertion — ถ้า test ถูกต้องแต่ code ผิด ให้แก้ code
5. ไฟล์ใหม่ใน `server/test/` หรือ `client/src/**/*.test.*` จะถูกรันอัตโนมัติ
