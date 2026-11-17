# Database Design — ER Diagram & Schema Spec

PostgreSQL 16 (production runtime). PKs เป็น `BIGINT GENERATED ... IDENTITY` (เดิม INTEGER rowid สมัย SQLite), FK enforced, migrations ผ่าน `schema_migrations`

## ER Diagram

```mermaid
erDiagram
    roles ||--o{ user_roles : has
    users ||--o{ user_roles : assigned
    users ||--o{ user_sessions : owns
    users ||--|| virtual_wallets : has
    users ||--o{ bet_slips : places
    users ||--o{ virtual_transactions : "own/audit"
    lottery_types ||--o{ lottery_draws : schedules
    lottery_types ||--o{ lottery_rules : defines
    lottery_draws ||--o{ bet_slips : receives
    lottery_draws ||--o| lottery_results : produces
    bet_slips ||--o{ bet_items : contains
    lottery_draws ||--o{ bet_items : "bets on"
    users ||--o{ audit_logs : acts

    roles { bigint id PK; text name UK; text description }
    permissions { bigint id PK; text code UK; text description }
    role_permissions { bigint role_id FK; bigint permission_id FK }
    users { bigint id PK; text username UK; text email UK; text password_hash; int status; text created_at; text updated_at }
    user_roles { bigint user_id FK; bigint role_id FK }
    user_sessions { text id PK; bigint user_id FK; text ip; text user_agent; text expires_at; text created_at }
    virtual_wallets { bigint id PK; bigint user_id FK UK; bigint balance "satang"; bigint version "optimistic lock"; text updated_at }
    virtual_transactions { bigint id PK; text reference UK; bigint wallet_id FK; bigint user_id FK; text type; bigint amount; bigint balance_after; text status; text idempotency_key UK; text description; text created_at }
    lottery_types { bigint id PK; text code UK; text name_th; text name_en; int is_active }
    lottery_categories { bigint id PK; bigint lottery_type_id FK; text code UK; text name_th; text draw_pattern }
    lottery_draws { bigint id PK; bigint lottery_type_id FK; bigint category_id FK; text draw_code UK; text draw_at; text close_at; text status; text result_numbers "JSON" }
    lottery_rules { bigint id PK; bigint lottery_type_id FK; text bet_type; text name_th; text match_config "JSON"; bigint payout_multiplier; bigint stake_unit; bigint min_amount; int is_active }
    bet_slips { bigint id PK; bigint user_id FK; bigint draw_id FK; text slip_ref UK; text status; bigint total_stake; bigint total_payout; text created_at; text settled_at }
    bet_items { bigint id PK; bigint slip_id FK; bigint draw_id FK; bigint rule_id FK; text bet_type; text number; bigint amount; text status; bigint payout; text result_detail "JSON" }
    lottery_results { bigint id PK; bigint draw_id FK UK; text winning_numbers "JSON"; text published_at; bigint published_by FK }
    audit_logs { bigint id PK; bigint user_id FK; text action; text entity_type; text entity_id; text detail "JSON"; text ip; text created_at }
    system_settings { text key PK; text value "JSON"; text updated_at }
```

## ตารางหลัก (สรุป column สำคัญ)

| Table | Key Points |
|---|---|
| users | username/email UNIQUE, password_hash (scrypt `salt:hash`), status (active/locked/disabled) |
| roles/permissions | RBAC — Super Admin / Admin / Member + permission codes เช่น `lottery.manage`, `wallet.adjust` |
| virtual_wallets | balance เก็บเป็น **bigint สตางค์** (กัน float), `version` สำหรับ optimistic lock |
| virtual_transactions | `idempotency_key` UNIQUE — กัน duplicate; type: deposit_adjust/debit_bet/credit_win/credit_refund/admin_adjust; status: pending/completed/failed/reversed |
| lottery_draws | status: scheduled/open/closed/settled/cancelled; close_at = deadline |
| lottery_rules | match_config JSON: `{match:"last2"|"first3"|"sorted3"|"contains_digit", ...}` — engine อ่านจาก DB |
| bet_items | number + bet_type ต้องตรง rule ที่เปิดใช้ของ draw นั้น |
| audit_logs | append-only, ไม่มี UPDATE/DELETE path ในโค้ด |
| system_settings | initial_credit, site_name, maintenance_mode ฯลฯ |

## Timestamp storage — decision (P1-9)

**ตอนนี้เก็บ timestamp ทั้งหมดเป็น `TEXT` รูปแบบ UTC `'YYYY-MM-DD HH:MM:SS'`** (naive, ไม่มี timezone) โดยตั้งใจ — codebase เดิมมาจาก SQLite และทั้ง service layer, scheduler (`pendingDraws`), settlement, และ test suite เทียบค่าแบบ string/lexical ordering ทั้งหมด

- ข้อดี: lexical compare = chronological compare สำหรับ format นี้; migration จาก SQLite ทำได้ตรง ๆ; ไม่ต้องแก้ query นับร้อยจุด
- ข้อเสีย: ไม่มี timezone safety ในตัว, `NOW()`/`::timestamptz` cast ใน ad-hoc query ต้องระวัง session TZ, scale ใหญ่ขึ้นจะเจอ edge case
- **แผนระยะยาว (ยังไม่ทำ)**: ถ้าจะ convert เป็น `TIMESTAMPTZ` ต้องทำเป็นโปรเจกต์แยก: (1) audit ทุก query ที่เทียบ timestamp, (2) dual-write หรือ backfill `AT TIME ZONE 'UTC'`, (3) แก้ test fixtures, (4) deploy แบบมี rollback — ห้ามทำ ad-hoc เพราะเคยเจอ `operator does not exist: text <= timestamp with time zone` ตอน query ผิดประเภท

## Constraints & Indexes

- UNIQUE: users.username, users.email, virtual_wallets.user_id, transactions.reference, transactions.idempotency_key, draws.draw_code, results.draw_id, slips.slip_ref
- INDEX: bet_items(draw_id), bet_slips(user_id, status), transactions(wallet_id, created_at), sessions(expires_at), audit_logs(user_id, created_at)
- FK: ทุก child → parent พร้อม `ON DELETE RESTRICT` (ป้องกันลบข้อมูลที่อ้างถึง)
- CHECK/constraint: amount > 0 สำหรับ transactions/bet_items, balance >= 0 (enforce ใน service layer ด้วย transaction + wallet version check)

## Migration & Seed

- `server/src/db/migrate.js` — versioned migrations (`schema_migrations` table), ปัจจุบันถึง migration `025`
- `server/src/db/schema.pg.sql` — schema เต็มสำหรับ DB ใหม่
- `server/src/db/seed.js` — roles/permissions, lottery types/categories, rules, system_settings, super admin account (password จาก env ตอน seed ครั้งแรก)
- `server/src/db/demo-data.js` / `demo-results.js` — ข้อมูลรอบและผล DEMO สำหรับทดสอบ/สาธิต (source='demo' เสมอ ไม่ใช่ผลจริง)
- Backup: `scripts/backup-pg.sh` (pg_dump custom format, retention 14 วัน) + restore ด้วย `scripts/restore-pg.sh` — ดู DEPLOY.md
