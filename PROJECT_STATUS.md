# PROJECT_STATUS.md — สถานะโปรเจกต์

> อัปเดตล่าสุด: 2026-11-23 | Branch: master | Deploy: Docker Compose บนเครื่อง local (LAN/demo)

## สถานะรวม: 🟢 ทำงานได้ — demo/LAN mode, ระบบเงินจริงยังไม่เปิด

ระบบแทงหวย + เกมด่วน (หวยขูด/ไฮโล/ยี่กี/น้ำเต้าปูปลา) แบบเครดิตเสมือน พร้อมโครงสร้างรับเงินจริง (PromptPay QR + สลิป + admin approve) แต่**ยังไม่เปิดรับเงินจริงจริง** — รอ legal/KYC/PDPA decisions

## Admin: สูงสุด 2 คน

- `super_admin` (full `*` permission) + `admin` role — ออกแบบ RBAC ละเอียด (25+ permissions) แต่ทีมจริง 1-2 คน
- **MFA (TOTP) บังคับสำหรับ admin** (`ADMIN_MFA_REQUIRED=true`) — member เปิดเองได้ใน Profile
- Break-glass: ถ้า admin ทั้ง 2 คนเข้าไม่ได้ → ต้องมีคนรู้ `SEED_ADMIN_PASSWORD`/reset ผ่าน DB โดยตรง (ยังไม่มี runbook — ดู "Known issues")

## Features ที่ทำงานแล้ว (verified ใน audit 2026-11-22/23)

- Auth: register (password policy 10+alpha+digit, terms consent), login, OTP phone/email, MFA/TOTP, sessions management, email verification (SMTP optional), forgot/reset password, Turnstile (optional), LINE login (ปิดอยู่)
- Lottery: ประเภทไทย/ลาว/ฮานอย/ลาวพัฒนา/ราศีไทย + demo markets, schedules, rules+payouts, results (external GLO/manual classified), settlement, winners board, fairness (provably fair seeds), export CSV
- Betting: write-once slips, idempotency, cancel ก่อนปิดรับ, TOD/announce, responsible gambling (daily/monthly limit, self-exclusion, age confirm)
- Instant games: scratch (5-reel 20-payline), hilo (3 dice), kiwi/kiwi_vip (zodiac→ตัวเลข), kiwi_dice/น้ำเต้าปูปลา (6 animals), verify seeds
- Payments: deposit QR PromptPay จริง (min 1฿), slip upload+compress, SlipOK optional / admin review, withdraw (min 100฿, PromptPay cross-check vs OTP phone), pending_slip resume UI, admin filter/badge
- Wallet: virtual ledger (satang), withdrawable logic (promotional credit ถอนไม่ได้), transactions history
- Admin: overview, members, roles, lottery/rules/categories/draws/results, bets, wallet adjust, payments review, settings, promotions cashback, reports+reconciliation, audit log, security events, health, broadcast, chat admin
- Realtime: SSE `/api/events`, notifications, web push (optional), Telegram alerts (overdue draws)
- Security: CSRF+HMAC, helmet CSP, rate limits, audit_logs, security_events, retention cleanup, promo-abuse guard

## Security scanning (เพิ่ม 2026-11-23)

- `scripts/security-scan.sh` — gitleaks+semgrep+trivy ผ่าน Docker
- CI: 3 security jobs (gitleaks history, semgrep ERROR, trivy CRITICAL/HIGH)
- ผลสแกนล่าสุด: **gitleaks 0 leaks (404 commits), semgrep 0 findings, trivy → พบ nodemailer 6.9.16 มี 5 HIGH CVE → อัปเกรดเป็น 10.6.0 แล้ว**

## Known issues / หนี้เทคนิค

| ระดับ | รายการ |
|---|---|
| 🟡 | `created_at` ทั้ง DB เป็น text `YYYY-MM-DD HH:MM:SS` (UTC) — ไม่ใช่ timestamptz; migration ใหญ่ถ้าจะแก้ |
| 🟡 | `mfa_secret` เก็บ plaintext ใน DB — ควร encrypt-at-rest ก่อน go-live |
| 🟡 | ไม่มี KYC/e-KYC/bank-account verify จริง — withdrawal อนุมัติ manual ล้วน |
| 🟡 | ไม่มี break-glass runbook สำหรับ admin 2 คน (คู่มือกู้ admin access) |
| 🟢 | `email_verified` ไม่บังคับก่อนเล่น/ถอน (มี verify flow แต่ไม่ enforce) |
| 🟢 | Turnstile/SMTP/SlipOK/Telegram ยังไม่ตั้ง production keys — ทำงานแบบ dev-fallback |
| 🟢 | Client ไม่มี unit tests; playwright smoke ไม่ได้อยู่ใน CI |
| 🟢 | `_audit-*.mjs`, `scripts/fix-*.mjs` ~50 one-off scripts ปนใน repo — ควรย้าย `scripts/oneoff/` |
| 🟢 | `docs/audit/*` 11 ฉบับเก่า อาจล้าสมัยหลัง feature ใหม่ |

## Recent commits (สำคัญ)

- `68a0b42` fix(security): block demo wallet self-mint when payments configured — **ช่องโหว่ร้ายแรงที่เจอใน audit**
- `a188f38` fix(payments): unblock pending_slip + auto-compress slip images
- `8467ffc` admin payments menu + pending badge + kind filter
- `425d78e` wallet payment requests top + 30 limit
- `9c627e4` deposit min 1฿ + PromptPay cross-check withdrawals

## Next recommended actions

1. **ก่อนรับเงินจริง**: legal opinion, KYC flow (e-KYC หรือ micro-deposit), withdrawal fraud review checklist, PDPA consent
2. ตั้ง SMTP + Turnstile keys บน production (ฟรี) — ตอนนี้ dev-fallback
3. Encrypt `mfa_secret` at rest + เขียน admin break-glass runbook
4. ย้าย one-off scripts → `scripts/oneoff/`, เพิ่ม payment-flow tests ใน `server/test/`
5. พิจารณา timestamptz migration เมื่อมี downtime window
