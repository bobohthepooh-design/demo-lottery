# Demo Lottery Platform — System Architecture

> DEMO ONLY — Virtual Credit เท่านั้น ไม่มีการเชื่อมต่อเงินจริง/Payment Gateway

## 1. Technology Stack

| Layer | Technology | เหตุผล |
|---|---|---|
| Runtime | Node.js 26 LTS | ติดตั้งแล้ว, npm มาตรฐาน |
| Backend | Express.js (ESM) | middleware ecosystem, RBAC ชัดเจน |
| Frontend | React 18 + Vite + Tailwind CSS | SPA responsive, build เร็ว |
| Database | PostgreSQL 16 | ACID transaction, FK/index ครบ, concurrent-safe |
| Auth | DB session cookie + scrypt (Node crypto) | password hashing มาตรฐาน, session revoke ได้ |
| MFA (Admin) | TOTP (RFC 6238, Node crypto) | ไม่พึ่ง paid service |
| Security | helmet, express-rate-limit, csrf-csrf, zod | OWASP Top 10 coverage |
| Test | Vitest + Supertest | unit + API integration |
| VCS | Git | version control |

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                      │
│  React SPA (Vite + Tailwind)  — Thai UI, Responsive          │
│  Member Pages │ Admin Dashboard │ Public Pages               │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS (local: http) JSON API
┌──────────────────────────▼──────────────────────────────────┐
│                     Express API Server                       │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌────────────────┐ │
│  │ helmet   │ │ rate-limit│ │ csrf-csrf │ │ zod validation │ │
│  └──────────┘ └──────────┘ └───────────┘ └────────────────┘ │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Middleware: session → auth → RBAC(permission) → audit │  │
│  └───────────────────────────────────────────────────────┘  │
│  Routes: /api/auth /api/lottery /api/bets /api/wallet       │
│          /api/results /api/admin/*                         │
│  ┌────────────┐ ┌──────────────┐ ┌───────────────────────┐ │
│  │ Lottery     │ │ Wallet        │ │ Auth/MFA/Audit        │ │
│  │ Engine      │ │ Service       │ │ Services              │ │
│  │ (rules from │ │ (ACID txns,   │ │ (scrypt, TOTP,        │ │
│  │  DB config) │ │  idempotency) │ │  session, RBAC)       │ │
│  └────────────┘ └──────────────┘ └───────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │ pg pool (async, txAsync wrapper)
┌──────────────────────────▼──────────────────────────────────┐
│                  PostgreSQL Database                            │
│  lottery DB — Backup = pg_dump (scripts/backup-pg.sh)          │
└──────────────────────────────────────────────────────────────┘
```

### Module Boundaries

| Module | หน้าที่ |
|---|---|
| `server/src/routes/` | HTTP layer เท่านั้น — validate input, เรียก service |
| `server/src/services/` | Business logic: lottery engine, wallet, auth, audit |
| `server/src/middleware/` | auth, RBAC, csrf, rate-limit, error handler |
| `server/src/db/` | connection, migrations, seed |
| `client/src/` | React pages/components/hooks |

## 3. Core Data Flows

### Bet Placement (สำคัญ — ต้อง atomic)
```
Member → POST /api/bets (CSRF token, session)
  → validate draw open + deadline not passed + number format
  → BEGIN TRANSACTION
      → lock wallet row (SELECT ... ) 
      → check balance >= total stake
      → INSERT bet_slips + bet_items
      → UPDATE wallet balance (balance - stake)
      → INSERT virtual_transactions (deduction, idempotency_key unique)
  → COMMIT → audit_log → response
```

### Result Settlement
```
Admin → POST /api/admin/results { draw_id, numbers }
  → BEGIN TRANSACTION
      → INSERT lottery_results
      → UPDATE draw status = settled
      → for each bet_item: evaluate vs lottery_rules config
      → winning items: credit payout via wallet transaction (refund/win)
      → UPDATE bet_slips status
  → COMMIT → audit_log
```

### Rules Evaluation (config-driven)
`lottery_rules` table กำหนด: bet_type (2top/2bottom/3top/3tod/run_top/run_bottom),
match_pattern (e.g. `last2`, `first3`, `sorted3`, `contains`), payout_multiplier, stake_unit
→ engine อ่าน config จาก DB ตอน evaluate ไม่ hardcode

## 4. Security Architecture (OWASP)

| Threat | Control |
|---|---|
| A01 Broken Access Control | RBAC middleware per-route, IDOR check (resource.user_id == session.user_id), least privilege |
| A02 Crypto Failures | scrypt password hash (N=16384,r=8,p=1), TLS-ready, secrets via .env |
| A03 Injection | parameterized queries ($n placeholders), zod validation, output encoding (React default) |
| A04 Insecure Design | atomic wallet txns, idempotency keys, draw deadline enforcement |
| A05 Security Misconfig | helmet headers, env-based config, no stack traces to client |
| A06 Vulnerable Components | dependency audit (`npm audit`), pinned versions |
| A07 Auth Failures | session expiry, brute-force rate limit + lockout, MFA TOTP for admin |
| A08 Data Integrity | audit_logs append-only, DB transactions, checksum on settings |
| A09 Logging Failures | audit_logs + security_events tables |
| A10 SSRF | no outbound fetch of user-supplied URLs (not applicable — noted) |

เพิ่มเติม: CSRF double-submit cookie, XSS (React escaping + CSP), secure session cookies (HttpOnly, SameSite=Lax), rate limiting login/register, generic error messages

## 5. Deployment

- Local dev: `npm run dev` (server :4000, client :5173 proxy)
- Prod-like: `npm run build` + `node server` serves dist
- Backup: `scripts/backup-pg.sh` (pg_dump custom format) + restore ด้วย `scripts/restore-pg.sh` — ดู DEPLOY.md
- Env: `.env` (SESSION_SECRET, INITIAL_CREDIT, PORT) — never committed
