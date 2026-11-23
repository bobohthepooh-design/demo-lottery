# Go-Live Checklist — ก่อนรับเงินจริงจริง

> ระบบปัจจุบัน = **demo/การศึกษา บน LAN** — เอกสารนี้รวมทุก decision ที่ต้องปิดก่อนเปิดเงินจริง
> อ้างอิง: PROJECT_STATUS.md, SECURITY.md, docs/BREAKGLASS.md

## 1. Legal & Compliance (ต้องตัดสินใจก่อนทุกอย่าง)

- [ ] **กฎหมายการพนัน**: กฎหมายในประเทศที่จะให้บริการ — setup ปัจจุบันไม่มี license; ถ้ารับเงินจริงต้องมีใบอนุญาตหรือโครงสร้างที่ถูกกฎหมาย (ปรึกษาทนาย/ที่ปรึกษากฎหมาย)
- [ ] **PDPA**: consent ชัดเจน, privacy policy, data retention policy, สิทธิ์เข้าถึง/ลบข้อมูล, breach notification plan
- [ ] **Terms of Service + Responsible Gambling**: age gate (มีแล้ว), self-exclusion (มี field), deposit/withdraw limits (มี daily/monthly limit fields), ปัญหาการติดการพนัน — help resources
- [ ] **AML/CFT พื้นฐาน**: KYC ทุกบัญชีที่ถอน, transaction monitoring, suspicious activity report process

## 2. Identity (KYC) — เลือก 1 ใน 3

| Option | Cost | Effort | เหมาะกับ |
|---|---|---|---|
| **A. e-KYC service** (iProov/HyperVerge/NDID) | สูง (per-check) | ต่ำ (API) | scale จริง |
| **B. Manual admin review** | ฟรี | สูง (คนตรวจ) | ทีมเล็ก/admin≤2 |
| **C. Micro-deposit bank verify** | ต่ำ | กลาง | verify bank account ownership |

- [ ] เลือก option → implement `kyc_status` ใน users + gate withdrawal
- [ ] เก็บเอกสาร KYC encrypted, retention policy, access log

## 3. Payment rails

- [ ] **PromptPay/ธนาคารจริง**: ยืนยัน account เป็นของใคร, reconciliation process รายวัน
- [ ] **SlipOK**: ตั้ง `SLIPOK_API_KEY` + verify amount/sender/receiver/dedup (ตอนนี้ optional)
- [ ] **Settlement**: วิธีโอนเงินออกจริง (โอนธนาคาร manual? payment gateway?), cutoff time, fee ใครจ่าย
- [ ] **Refund/dispute flow**: dispute window, chargeback handling, admin escalation
- [ ] **Reconciliation**: report daily — deposits approved vs bank inflow, withdrawals paid vs outflow

## 4. Security hardening ก่อน go-live

- [ ] Turnstile keys (bot protection) — register/login/OTP
- [ ] SMTP จริง (email verify + password reset — ตอนนี้ dev fallback)
- [ ] เปิด `require_email_verify_for_withdraw` หลังแจ้ง member
- [ ] Rotate SESSION_SECRET + secrets ทั้งหมดที่เคยอยู่ในเครื่อง dev
- [ ] WAF/rate-limit review สำหรับ internet exposure (ตอนนี้ LAN trust)
- [ ] Backup: offsite copy + **restore drill จริง** (เคย restore จริงไหม?)
- [ ] Monitoring/alerting: uptime, error rate, failed logins, payment anomalies → Telegram/Slack
- [ ] Incident response runbook + on-call contact

## 5. Operations

- [ ] Admin training: payment review, settle results, break-glass (docs/BREAKGLASS.md)
- [ ] Second admin account setup + MFA enrolled (admin≤2 — bus factor!)
- [ ] Runbook: draw result missing, payment dispute, DB restore, secret rotation
- [ ] Audit log review schedule (weekly?)
- [ ] Load test กับ traffic จริงที่คาดการณ์ (baseline: ~1,667 RPS p50 2.5ms)

## 6. Product readiness

- [ ] Result sources: ทุก market มีแหล่งผลจริงหรือ manual ชัดเจน (demo gen ห้ามใช้เงินจริง)
- [ ] Responsible gambling UI: limits settings, self-exclusion flow, reality check
- [ ] Support channel: วิธี member แจ้งปัญหา + SLA
- [ ] Announcement/maintenance mode tested

## 7. Technical debt ที่ควรปิดก่อน scale

- [ ] `created_at` text → timestamptz migration
- [ ] Container registry + cosign signing + SBOM ใน release pipeline
- [ ] ZAP findings review (nightly job — ดู artifact)
- [ ] Component tests สำหรับ Wallet/Lotteries/PlaceBet
- [ ] DB read replica / connection pooling review ถ้า traffic สูง

---

## สถานะปัจจุบัน (ของที่มีแล้ว)

✅ MFA admin+member, encrypted secrets, HIBP password check, CSRF+CSP+rate-limit,
✅ write-once slips + idempotency + ledger, USE_PAYMENTS guard, RBAC+audit logs,
✅ CI 5 jobs เขียว + SBOM + ZAP nightly, break-glass runbook, docs ครบ

❌ ยังขาด: legal/license, KYC จริง, payment rails จริง, monitoring/alerting,
offsite backup verify, Turnstile/SMTP production keys
