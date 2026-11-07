# Database Design — ER Diagram & Schema Spec

SQLite, all PKs INTEGER (SQLite rowid alias) or TEXT UUID, FK enforced (`PRAGMA foreign_keys=ON`).

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

    roles { int id PK; string name UK; string description }
    permissions { int id PK; string code UK; string description }
    role_permissions { int role_id FK; int permission_id FK }
    users { int id PK; string username UK; string email UK; string password_hash; int status; datetime created_at; datetime updated_at }
    user_roles { int user_id FK; int role_id FK }
    user_sessions { string id PK; int user_id FK; string ip; string user_agent; datetime expires_at; datetime created_at }
    virtual_wallets { int id PK; int user_id FK UK; int balance "INTEGER cents"; int version "optimistic lock"; datetime updated_at }
    virtual_transactions { int id PK; string reference UK; int wallet_id FK; int user_id FK; string type; int amount; int balance_after; string status; string idempotency_key UK; string description; datetime created_at }
    lottery_types { int id PK; string code UK; string name_th; string name_en; int is_active }
    lottery_categories { int id PK; int lottery_type_id FK; string code UK; string name_th; string draw_pattern }
    lottery_draws { int id PK; int lottery_type_id FK; int category_id FK; string draw_code UK; datetime draw_at; datetime close_at; string status; string result_numbers "JSON" }
    lottery_rules { int id PK; int lottery_type_id FK; string bet_type; string name_th; string match_config "JSON"; int payout_multiplier; int stake_unit; int min_amount; int is_active }
    bet_slips { int id PK; int user_id FK; int draw_id FK; string slip_ref UK; string status; int total_stake; int total_payout; datetime created_at; datetime settled_at }
    bet_items { int id PK; int slip_id FK; int draw_id FK; int rule_id FK; string bet_type; string number; int amount; string status; int payout; string result_detail "JSON" }
    lottery_results { int id PK; int draw_id FK UK; string winning_numbers "JSON"; datetime published_at; int published_by FK }
    audit_logs { int id PK; int user_id FK; string action; string entity_type; string entity_id; string detail "JSON"; string ip; datetime created_at }
    system_settings { string key PK; string value "JSON"; datetime updated_at }
```

## ตารางหลัก (สรุป column สำคัญ)

| Table | Key Points |
|---|---|
| users | username/email UNIQUE, password_hash (scrypt `salt:hash`), status (active/locked/disabled) |
| roles/permissions | RBAC — Super Admin / Admin / Member + permission codes เช่น `lottery.manage`, `wallet.adjust` |
| virtual_wallets | balance เก็บเป็น **integer สตางค์** (กัน float), `version` สำหรับ optimistic lock |
| virtual_transactions | `idempotency_key` UNIQUE — กัน duplicate; type: deposit_adjust/debit_bet/credit_win/credit_refund/admin_adjust; status: pending/completed/failed/reversed |
| lottery_draws | status: scheduled/open/closed/settled/cancelled; close_at = deadline |
| lottery_rules | match_config JSON: `{match:"last2"|"first3"|"sorted3"|"contains_digit", ...}` — engine อ่านจาก DB |
| bet_items | number + bet_type ต้องตรง rule ที่เปิดใช้ของ draw นั้น |
| audit_logs | append-only, ไม่มี UPDATE/DELETE path ในโค้ด |
| system_settings | initial_credit, site_name, maintenance_mode ฯลฯ |

## Constraints & Indexes

- UNIQUE: users.username, users.email, virtual_wallets.user_id, transactions.reference, transactions.idempotency_key, draws.draw_code, results.draw_id, slips.slip_ref
- INDEX: bet_items(draw_id), bet_slips(user_id, status), transactions(wallet_id, created_at), sessions(expires_at), audit_logs(user_id, created_at)
- FK: ทุก child → parent พร้อม `ON DELETE RESTRICT` (ป้องกันลบข้อมูลที่อ้างถึง)
- CHECK: amount > 0 สำหรับ transactions/bet_items, balance >= 0 (enforce ใน service layer ด้วย transaction)

## Migration & Seed

- `server/src/db/migrate.js` — versioned migrations (`schema_migrations` table)
- `server/src/db/seed.js` — roles/permissions, 3 lottery types (TH/LA/HN), categories, rules, system_settings, super admin account (password จาก env ตอน seed ครั้งแรก)
- Backup: `VACUUM INTO` หรือ copy ไฟล์ .db (รวม -wal)
