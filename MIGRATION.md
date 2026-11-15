# PostgreSQL Migration Plan

> สถานะ: **Step 1 เสร็จ** (2026-11-15) — adapter + schema พร้อม, ยังไม่ได้ port call sites
> compose มี service `postgres` (profile) ทำงานแล้ว: `docker compose --profile postgres up -d`
> ทดสอบแล้ว: schema apply ผ่าน (27 tables/25 indexes), pg.js translate+query ใช้ได้จริง

## ทำไมยาก

- query ทั้งหมดใช้ **synchronous** `node:sqlite` API: `db.prepare(...).get()/.all()/.run()`
- **338 จุด** `prepare()` ใน 24 ไฟล์ — ทุกจุดต้องกลายเป็น `async/await`
- SQLite-specific syntax ~63 จุด: `datetime('now')`, `INSERT OR IGNORE`, `lastInsertRowid`, `?` placeholders
- transaction helper `tx(fn)` เป็น sync — ต้องเปลี่ยนเป็น async ทั้งหมด (routes → services → db)

## แนวทางที่แนะนำ (big-bang ทีละ layer)

### Step 1 — Data access adapter ✅ เสร็จ
- `server/src/db/pg.js`: Pool + `q/qGet/qRun/qInsert/pgTx/clientQ` + `translate()` (SQLite→PG dialect)
- `server/src/db/schema.pg.sql`: schema แปลงจาก SQLite จริง (27 tables, FK-safe order, BEGIN/COMMIT) — apply ผ่านแล้ว
- `config.databaseUrl` + `DATABASE_URL` env + `pg@8` installed
- compose: postgres service (profile) + port 127.0.0.1:5432 สำหรับ migration scripts

### Step 2 — Schema ✅ เสร็จ (รวมใน Step 1)
- `schema.pg.sql` generated จาก sqlite_master จริง — ไม่ต้องแปลง migration 22 ไฟล์เอง
- แก้แล้ว: IDENTITY PK, BIGINT, TEXT timestamp format เดียวกับ SQLite, เอา COLLATE NOCASE ออก

### Step 3 — Port call sites (งานหลัก ~338 จุด) — กำลังทำ
**Pattern ที่ตกลง (สำคัญ — ห้ามเปลี่ยน):**
- `db.prepare().get/all/run` → `await` นำหน้า (await ค่าธรรมดาใน sqlite ก็ใช้ได้ — code เดียวรันได้ 2 โหมด)
- `tx(fn)` sync เดิม **ห้ามแตะ** (sqlite only, pg mode จะ throw) → code ที่ port ใช้ **`txAsync(async d => {...})`** แทน — `d` เป็น facade `{prepare()}` เหมือน DatabaseSync
- `audit()`/`securityEvent()` → dual-mode แล้ว (fire-and-forget, caller ไม่ต้องแก้) ✅
- `getDb()` → pg facade อัตโนมัติเมื่อ `DATABASE_URL` ถูกตั้ง
- **dual-mode wrapper** สำหรับ service ที่ caller ยังไม่ port: sync ใน sqlite / คืน Promise ใน pg — caller เก่าไม่พัง, caller ใหม่ `await` ได้ทั้งคู่

**สถานะ port (dual-mode เสร็จ = sqlite ไม่กระทบ, pg path พร้อมเมื่อ caller await):**
- ✅ lib/audit.js, db/index.js (facade+txAsync), db/pg.js
- ✅ services/settingsService.js, notifyService.js, pushService.js + routes/push.js
- ✅ services/walletService.js — dual-mode ครบ (read APIs, adminAdjust, memberWalletAction, debitForBetTx/creditTx branch ตาม d.__pg) — verify sqlite: balance/withdrawable/tx ปกติ
- ✅ services/promoService.js — dual-mode (runCashback/maybeDailyCashback/previewCashback) — verify sqlite preview ปกติ
- ✅ services/authService.js — dual-mode ครบ (getSession/requireAuth/register/login/logout/changePassword/forgotPassword/MFA/OTP) — syntax+exports OK; **หมายเหตุ:** routes ที่เรียก login/register/OTP ต้อง `await` เมื่อ port routes (pg mode เท่านั้นที่ต้อง, sqlite คืนค่าเดิม)
- ✅ services/lotteryService.js — dual-mode ครบทุก export (listDraws/getDraw/placeBet/cancelBet/settleDraw/updateDrawStatus ฯลฯ) — verify sqlite: draws/getDraw/myStats/annEntries ปกติ
- ✅ services/resultFetcher.js — dual-mode (pendingDraws/autoSettleResults/updateDrawResult; fetch/generator functions ไม่แตะ) — verify generators+fairness ปกติ; **หมายเหตุ:** settleDraw ถูก await แล้วใช้ได้ทั้ง 2 โหมด
- ✅ services/hiloService.js — dual-mode ครบ (ensureInfra/standingDraw/pickRule/multFor/hiloPrice/buyTicket/playTicket/listMyTickets/guessTicket/cancelTicket) — verify sqlite: outcome/mults/seed ปกติ
- ✅ services/kiwiService.js — dual-mode ครบ (ensureInfra/gamePrice/playKiwi/listMyKiwi/kiwiInfo; ticketView รับ prices override สำหรับ pg) — verify sqlite: dice/numbers/info ปกติ
- ✅ services/scratchService.js — dual-mode ครบ (ensureInfra/standingDraw/scratchRule/cardPrice/buyCard/listMyCards/getCard/verifyScratchSeed/revealCard/cancelCard + evaluateGridPg/effectiveSymbolsPg/prizeTablePg; pure: genGrid/PAYLINES/evaluateGridWith) — verify sqlite: 20 paylines/grid/evaluate/price ปกติ
- ✅ routes ทั้งหมด (push, kiwi, scratch, hilo, bets, notifications, lottery, chat, auth, admin) — async handlers + await ทุก service/db call
- ✅ middleware/rbac.js — userPermissions/hasRole dual-mode, requirePerm/requireRole async
- ✅ db/migrate.js — migrate() dual-mode (pg ใช้ schema.pg.sql ครั้งเดียว + mark versions)
- ✅ db/seed.js, seed-rules.js, demo-data.js, demo-results.js — dual-mode (txAsync, INSERT OR IGNORE ผ่าน translate, CAST(id AS TEXT) แทน || int)
- ✅ index.js startup — top-level await migrate/seed/ensureInfra, interval ห่อ Promise.resolve().catch, cleanup async
- ✅ db/pg.js translate() เพิ่ม: date('now',±N unit), date(col)→left(col,10), strftime('%Y-%m',col|'now')
- ✅ admin.js GROUP BY แก้ให้ PG-compatible (เพิ่ม col ใน GROUP BY)
- verify: sqlite smoke ผ่าน (users:6, draws:288, rules:61, isPg:false), server restart แล้ว /api/health + public-config + draws + types + markets ตอบปกติ
- ✅ E2E test Postgres จริง (postgres:16 container, DATABASE_URL, port 4001): boot→migrate→seed(admin+50 rules)→demo-data(41 draws)→login/register→wallet→scratch buy/reveal(win_credit)→hilo guard→kiwi info→bet place+idempotency→my bets — ผ่านทั้งหมด
- 🐛 bugs ที่เจอและแก้ระหว่าง E2E:
  - pg int8/numeric คืน string → setTypeParser(20→parseInt, 1700→Number) ใน pg.js (แก้ COUNT/SUM/balance เป็น number เหมือน sqlite)
  - schema_migrations เก่าไม่มี column name → ALTER TABLE ADD COLUMN IF NOT EXISTS
  - pgPrepare ใส่ RETURNING id ให้ทุก INSERT → ตารางไม่มี id (role_permissions/user_roles/system_settings/schema_migrations) พัง → NO_ID_TABLES skip
  - hiloService.ensureInfraPg เรียก hiloPricePg() ก่อน HL-STANDING draw ถูกสร้าง → null.lottery_type_id → อ่าน price จาก rule ตรงๆ แทน + standingDrawPg เรียก ensureInfraPg() (lazy-init parity กับ sqlite)
- ✅ Data migration: `server/sqlite-to-pg.mjs` — copy ข้อมูลจริง SQLite→PG สำเร็จ 6,231 rows / 27 tables (FK-safe order, OVERRIDING SYSTEM VALUE preserve id, TRUNCATE ก่อนเขียน, reset sequences) — verify: server บน PG เสิร์ฟข้อมูลจริง (40 draws, 7 results, 30 winners)
- วิธีใช้: `DATABASE_URL=postgres://... node server/sqlite-to-pg.mjs [path/to.db]` (เพิ่ม `--append` ถ้าไม่อยากล้างข้อมูล PG)
- ✅ Cutover procedure: (1) docker compose --profile postgres up -d (2) รัน schema ผ่าน migrate() ตอน boot (3) sqlite-to-pg.mjs copy ข้อมูล (4) ตั้ง DATABASE_URL ใน .env แล้ว restart app — SQLite file เก็บไว้เป็น backup
- ⏳ เหลือ: ตัดสินใจเปิดใช้ DATABASE_URL จริงบน production, backup/restore สำหรับ PG (scripts/backup-db.sh ยังเป็น sqlite-only)

### Step 4 — Switch
- `config.databaseUrl` → ถ้ามีใช้ pg, ไม่มีใช้ sqlite (dual-mode ช่วง transition)
- หรือเปลี่ยนถาวรแล้วลบ sqlite path

### Step 5 — Data migration
- script `scripts/sqlite-to-pg.mjs`: อ่านทีละตาราง → insert เป็น batch
- ลำดับตาม FK: users → roles → wallets → types/categories/rules → draws/results → slips/items → instant games → audit/notifications

## ความเสี่ยง
- transaction boundary เปลี่ยน (sync→async) — ต้องทดสอบ wallet/settle flow ทั้งหมดใหม่
- `tx()` ปัจจุบันกัน concurrent ด้วย single connection — pg pool ต้องใช้ `pool.connect()` + BEGIN/COMMIT ต่อ connection
- datetime storage: SQLite เก็บ TEXT 'YYYY-MM-DD HH:MM:SS' UTC — Postgres ใช้ TIMESTAMPTZ; ต้อง normalize ตอน migrate + query

## Estimate
- Adapter + schema: ~1 session
- Port 338 call sites + test: ~2-3 sessions
- Data migration + verify: ~1 session
