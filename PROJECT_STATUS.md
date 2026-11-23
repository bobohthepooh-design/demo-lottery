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
| 🟡 | ~~`mfa_secret` plaintext~~ → แก้แล้ว: AES-256-GCM `enc:v1:` + `MFA_ENCRYPTION_KEY` แยก (rotate SESSION_SECRET ได้ไม่ทำ MFA พัง) |
| 🟡 | ไม่มี KYC/e-KYC/bank-account verify จริง — withdrawal อนุมัติ manual ล้วน |
| 🟡 | Break-glass เป็น manual runbook (`docs/BREAKGLASS.md`) — ไม่มี automation/alert |
| 🟢 | `email_verified` ไม่บังคับก่อนถอนโดย default — มี setting `require_email_verify_for_withdraw` (admin เปิดใน Settings เมื่อพร้อม) |
| 🟢 | Turnstile/SMTP/SlipOK/Telegram ยังไม่ตั้ง production keys — ทำงานแบบ dev-fallback |
| 🟢 | ~~Client ไม่มี unit tests~~ → มีแล้ว 9 tests (vitest+jsdom); e2e smoke อยู่ใน CI job `e2e` |
| 🟢 | ~~one-off scripts ปน repo~~ → ย้าย `scripts/oneoff/` แล้ว 60 ไฟล์ |
| 🟢 | `docs/audit/*` 11 ฉบับเก่า อาจล้าสมัยหลัง feature ใหม่ |
| 🟢 | GitHub repo public: `github.com/bobohthepooh-design/demo-lottery` — CI 5 jobs เขียว (test/e2e/gitleaks/semgrep/trivy) |

## Recent commits (สำคัญ)

- `d99aa4a` feat(payments): require_email_verify_for_withdraw setting (default off)
- `67c4766`/`2db8566` CI fixes: migrate/seed advisory lock, smoke drift, semgrep GCM, trivy docker, vitest 5.1.1 — **CI 5/5 jobs เขียวบน GitHub แล้ว**
- `c1fcaa6` e2e CI job + client component tests + image digest pinning
- `78f181b` admin break-glass runbook + HIBP password breach check
- `78ce9e8` MFA secret AES-256-GCM at rest + payments.test.js 12 tests (+พบ withdraw INSERT bug)
- `68a0b42` fix(security): block demo wallet self-mint when payments configured — **ช่องโหว่ร้ายแรงที่เจอใน audit**
- `a188f38` fix(payments): unblock pending_slip + auto-compress slip images
- `8467ffc` admin payments menu + pending badge + kind filter

## Next recommended actions

1. **ก่อนรับเงินจริง**: legal opinion, KYC flow (e-KYC หรือ micro-deposit), withdrawal fraud review checklist, PDPA consent
2. ตั้ง SMTP + Turnstile keys บน production (ฟรี) — ตอนนี้ dev-fallback
3. Admin: review pending payment requests (user 14 มี 2 pending_slip, user 63 มี 1 pending_review — ข้อมูลจริง)
4. เมื่อพร้อม: เปิด `require_email_verify_for_withdraw` + แจ้ง member ที่ยังไม่ verify
5. พิจารณา timestamptz migration เมื่อมี downtime window
