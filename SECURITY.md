# Security Policy & Current Posture

> ระบบนี้เป็น **demo/การศึกษา** — ยังไม่ใช่ระบบเงินจริงที่ได้รับอนุญาต
> ก่อน go-live ต้องผ่าน legal review + KYC + payment compliance (ดู PROJECT_STATUS.md)

## Reporting a vulnerability

- **ห้าม** เปิด public issue สำหรับช่องโหว่ — ติดต่อ admin โดยตรง
- ช่องทาง: Discord/Telegram ของทีม (internal) หรือ email ใน `.env` contact
- จะตอบภายใน 72 ชม.; ช่องโหว่ critical จะ patch ก่อน disclose

## Security controls ที่มีจริง (verify แล้วใน session 2026-11)

### Authentication & Session
- Password: scrypt (N=16384), policy ≥10 ตัว + alpha+digit, **HIBP k-anonymity breach check** (fail-open, `HIBP_CHECK=false` ปิดได้)
- Lockout: 5 ครั้งผิด → ล็อก 15 นาที; session cookie HttpOnly+SameSite, CSRF double-submit+HMAC, idle expiry
- **MFA TOTP**: admin required (`ADMIN_MFA_REQUIRED=true`), member optional; secret **encrypted at rest** AES-256-GCM (`enc:v1:`, key `MFA_ENCRYPTION_KEY`)
- OTP: phone/email, dev-echo เฉพาะ private IP (`canEchoOtp`), rate-limited
- Sessions: list/revoke ใน profile, revoke-all on password change

### Authorization
- RBAC: roles + 25+ permissions, `requirePerm`/`requireRole` ทุก admin route
- IDOR: ทุก query scope ด้วย `user_id` — member เห็นเฉพาะของตัวเอง
- Admin ≤2 คน — break-glass runbook: `docs/BREAKGLASS.md`

### API & Transport
- zod validation ทุก input, parameterized queries (pg `$n`), helmet CSP/HSTS/CORP
- Rate limit แยก auth-flow/public, `TRUST_PROXY` default ปิดใน production
- SSE `/api/events` + `/api/v1` alias, OpenAPI spec

### Financial integrity
- Write-once slips, idempotency keys ทุก mutation (bets/wallet/payments/games)
- Ledger `virtual_transactions` (balance_after ทุกแถว), optimistic wallet version
- Withdrawable = deposited+won เท่านั้น (promo credit ถอนไม่ได้), ต้องปลดล็อก 100 บาท + ไม่มีโพยค้าง
- **USE_PAYMENTS guard**: เมื่อ PROMPTPAY_ID ตั้งค่า ห้าม `/bets/wallet/action` (self-mint = 403)
- Payments: PromptPay EMV QR, slip upload (resize client-side), SlipOK optional, transRef dedup, admin approve/reject ทั้ง pending_slip+pending_review
- Deposit idempotent credit (`pay-<ref>`), withdraw debit ครั้งเดียว

### Data & Secrets
- `.env` gitignored, image digest-pinned, DB bind 127.0.0.1 only, non-root container
- audit_logs + security_events ครบ admin/member actions
- Retention job ลบข้อมูลเก่า, backup-daily pg_dump

## Known gaps (ซื่อสัตย์)

| ระดับ | รายการ |
|---|---|
| 🔴 go-live blocker | ไม่มี KYC, withdrawal review manual ทั้งหมด, legal/license review, Turnstile keys ยังไม่ตั้ง |
| 🟡 medium | `created_at` เป็น text ไม่ใช่ timestamptz, permission cache 30s, break-glass เป็น manual runbook; email_verified บังคับได้ผ่าน setting `require_email_verify_for_withdraw` (default ปิด) |
| 🟢 low | HIBP fail-open (ตั้งใจ), OTP dev-echo ผูกกับ private IP check |

## Security testing

- SAST: semgrep (p/javascript+typescript+nodejs+owasp-top-ten+secrets) — CI gate ERROR
- Secrets: gitleaks full history — CI
- Vuln/IaC: trivy fs+config CRITICAL/HIGH — CI
- Deps: `npm audit --audit-level=high` ×3 dirs — CI
- Local: `bash scripts/security-scan.sh [gitleaks|semgrep|trivy|all]`
- DAST: ยังไม่มี (ZAP baseline = future)

## Operational rules

- ห้าม commit secrets, ห้าม `UPDATE users SET balance` ตรงๆ (ใช้ wallet service)
- Admin action ทุกตัวต้อง audit — ห้าม bypass `requirePerm`
- Schema change → migration file + deploy doc; additive เท่านั้นถ้าเป็นไปได้
- Break-glass ใช้เฉพาะเหตุฉุกเฉิน + ต้องจด audit (docs/BREAKGLASS.md)
