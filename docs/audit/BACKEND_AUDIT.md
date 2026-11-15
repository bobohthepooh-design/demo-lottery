# BACKEND AUDIT — รายงานตรวจสอบหลังบ้าน

## 1. โครงสร้าง
- `server/src/index.js` — Express app, helmet, rate limit, CSRF, routes, static, scheduler
- `server/src/routes/` — auth, lottery, bets, notifications, scratch, hilo, kiwi, push, chat(member+admin), admin
- `server/src/services/` — authService, walletService, lotteryService, resultFetcher, luckyService, notifyService, promoService, pushService, settingsService, scratchService, hiloService, kiwiService, events
- `server/src/middleware/` — csrf (double-submit HMAC), rbac (requireAuth/requirePerm/requireRole/requireMfaVerified), errorHandler
- `server/src/lib/` — audit, password (bcrypt), totp, zodiac
- `server/src/db/` — index (node:sqlite), migrate, migrations 001-022, seed, demo-data, seed-rules
- `server/src/config.js` — env config

## 2. ผลตรวจสอบ (live smoke test + code audit รอบก่อน)

### Auth & Session
- ✅ Session `dl_session` HttpOnly + SameSite; status check ทุก request (active user เท่านั้น)
- ✅ loginLimiter + OTP rate limit + MFA TOTP
- ✅ bcrypt password hash; reset → revoke sessions + security event
- ✅ `/api/auth/me` คืน 401 ไม่มี session; member→admin ทุก endpoint = 403 (ทดสอบจริง)

### RBAC
- ✅ `requirePerm('xxx')` ทุก admin route; super_admin เท่านั้นจัดการ roles
- ✅ กัน admin ล็อก/ลบตัวเอง (แก้รอบก่อน)
- ✅ member chat vs admin chat แยก mount + guard

### CSRF
- ✅ double-submit: cookie `dl_csrf` + header `x-csrf-token` (HMAC-signed `${cookie}.${hmac}`)
- ✅ apply ทุก `/api/` mutating; GET/HEAD exempt
- ⚠️ cookie rotate → client ต้อง resetCsrf (ไม่มี auto-retry, ระดับต่ำ)

### Validation
- ✅ Zod ทุก route สำคัญ (bets, wallet, admin CRUD)
- ✅ bet slip: number format/_range/count/stake min-max/over-cap per type — atomic tx + idempotency_key unique
- ✅ draw: close<draw, code unique, ไม่สร้างให้ instant types
- ✅ rules: type ต้องมีจริง, bet_type unique, identity fields ล็อกตอน PATCH

### Wallet
- ✅ satang integer; version-check optimistic lock; withdrawable = deposited+winnings−withdrawn−pending; promo ไม่ถอนได้; unlock 100฿; pending slip บล็อกถอน
- ✅ deposit idempotent (idem key); audit `wallet.deposit/withdraw/adjust`
- ✅ admin adjust: reason บังคับ + idempotency + audit + notify

### Lottery pipeline (audit รอบก่อน — ผ่าน)
- ✅ create/update/close/cancel/settle/auto-settle; announce merge; HR block admin manual; deterministic fallback ตั้งใจ; skipped/errors รายงานชัด
- ✅ settle: snapshot payout+match_config, idempotent, notify winners + balance-change users
- ✅ updateDrawResult: admin only, audit, re-evaluate, notify diff (แก้รอบก่อน)

### Instant games
- ✅ Kiwi/Hilo/Scratch: server seed commit→play→reveal, PRNG deterministic, fairness verify endpoint, price/mult sync กับ settings (kiwi แก้รอบก่อน)
- ✅ play = atomic tx (slip+item+ticket+debit+win credit)

### Scheduler
- ✅ setInterval 1min: auto-settle due draws + result fetch + seed rotation + cashback; settleRunning flag กันซ้อน

### Notifications/Events
- ✅ notifyService: in-app + push; events.emit → SSE `sys:update`
- ✅ chat: threads/messages, member เห็นเฉพาะ thread ตัวเอง, admin broadcast

## 3. ปัญหาที่พบ

| # | ปัญหา | ระดับ | ไฟล์ | รายละเอียด |
|---|---|---|---|---|
| BK-01 | 35 bet_items pending บน draw closed | กลาง | DB | draws ปิด/settle/cancel แต่ items ยังค้าง — settleDraw mark ผลแล้วบางส่วนไม่ครบ; ต้อง backfill หรือยกเลิก |
| BK-02 | updateDrawResult silent skip | ต่ำ | admin.js | user ที่เงินไม่พอหัก diff ถูกข้ามเงียบๆ — house รับขาดทุน (demo-acceptable) |
| BK-03 | settings PUT รับ key มั่ว | ต่ำ | admin.js | admin-only; สร้าง key แปลกได้แต่ไม่พังระบบ |
| BK-04 | ไม่มี request timeout/global error metric | ข้อเสนอแนะ | index.js | errorHandler กลางมีแล้ว; ไม่มี APM |

## 4. ทดสอบที่ทำจริง
- `GET /health` → 200
- Public endpoints (markets/results/winners/public-config/vapid) → 200
- Protected endpoints ไม่มี auth → 401 ครบ 9 ตัว
- Admin endpoints ไม่มี auth → 401 ครบ 7 ตัว
- Member session → member endpoints 200, admin endpoints 403
- IDOR `/bets/slips/:ref` ของ user อื่น → 404 (ไม่รั่ว)
- PATCH-only route (`/me/responsible-gambling`) GET → 404 (method ถูกต้อง)
