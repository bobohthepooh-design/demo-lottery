# Changelog

รูปแบบ: Keep a Changelog — สรุปเฉพาะ milestone สำคัญ (รายละเอียดราย commit ดู `git log`)

## [Unreleased]

## [2026-11] — DevSecOps & Security Hardening sprint

### Added
- **CI pipeline 5 jobs**: server+client tests, e2e smoke (postgres+server จริง), gitleaks, semgrep SAST, trivy fs+IaC — GitHub Actions
- **Server tests 47→62**: `payments.test.js` 12 tests (deposit/slip/approve/withdraw/USE_PAYMENTS guard), `haveibeenpwned.test.js` 4 tests
- **Client tests**: vitest + jsdom — 9 tests (bettingWindow parity, resultSource badges, cn, Countdown component)
- **`tests/load.mjs`**: dependency-free load probe (RPS/p50/p95/p99, แยก 429)
- **`scripts/security-scan.sh`**: local scanner runner ผ่าน docker images
- **MFA encryption at rest**: `lib/secretBox.js` AES-256-GCM (`enc:v1:`), key จาก `MFA_ENCRYPTION_KEY` (fallback SESSION_SECRET) — re-encrypt อัตโนมัติตอน boot
- **HIBP password check**: k-anonymity vs api.pwnedpasswords.com, fail-open, `HIBP_CHECK=false` ปิดได้ — ครอบ register/change/reset
- **`docs/BREAKGLASS.md`**: admin recovery runbook (password/MFA/session-secret/admin-add)
- **`docs/SELF_UPGRADE_REPORT.md`**: Phase 8 validation report 10 หัวข้อ
- **`AGENTS.md` + `PROJECT_STATUS.md`**: agent workflow + project status
- Digest pinning: node:24-alpine, postgres:16-alpine, caddy:2-alpine

### Fixed
- **CRITICAL**: demo wallet self-mint — `/bets/wallet/action` คืน 403 `USE_PAYMENTS` เมื่อ PROMPTPAY_ID ตั้งค่า (fake credit → withdraw จริงได้)
- **paymentService**: withdraw INSERT ผิดจำนวน column (500 ทุกครั้ง) — พบจาก test ใหม่
- **migrate/seed race**: `pg_advisory_lock` กัน concurrent DDL/seed บน DB เปล่า (CI failure)
- **smoke.mjs drift**: termsAccepted, bettable-draw selection ตาม betting window, INITIAL_CREDIT/PROMPTPAY_ID env
- **pending_slip stuck**: resume upload UI + client-side image compression + admin pending filter รวม pending_slip
- GCM `authTagLength:16` ชัดเจน (semgrep blocking finding)
- vitest client 2.x→5.1.1 (critical CVE ใน vite/tinypool)
- trivy CI: docker image แทน action (setup failure)

### Changed
- 60 one-off scripts → `scripts/oneoff/`
- nodemailer 6.9.16→10.6.0 (5 HIGH CVEs)
- Admin payments menu → "เติม/ถอนเงิน" + pending badge + kind filter

## [ก่อนหน้า] — Lottery platform build-out (สรุป)
- PostgreSQL migration, lottery markets TH/LA/Hanoi/zodiac/instants, settlement+idempotency+write-once slips, SSE, RBAC, audit logs, responsible gambling, PromptPay payments + SlipOK
