# SYSTEM AUDIT — รายงานตรวจสอบระบบทั้งหมด
**วันที่ตรวจ:** รอบสมบูรณ์ (รวมผล audit รอบก่อนหน้าที่บันทึกในประวัติ)  
**ขอบเขต:** Demo Lottery Platform — Thai-only, virtual credits, educational/demo

---

## 1. ภาพรวมระบบ

| ชั้น | เทคโนโลยี | ที่ตั้ง |
|---|---|---|
| Frontend | React 18 + Vite + Tailwind + Framer Motion | `client/` |
| Backend | Express 4 + ES modules | `server/` |
| Database | SQLite (better-sqlite3/node:sqlite) | `server/data/demo-lottery.db` |
| Auth | Session cookie `dl_session` + TOTP MFA + CSRF double-submit | `server/src/middleware/` |
| Realtime | SSE `sys:update` (polled ~5s) | `server/src/services/events.js` |
| Static serve | Express serve `client/dist` | `server/src/index.js` |

**โมดูลทั้งหมด:** Auth/Login/Register/MFA/OTP · Lottery types/categories/rules/draws/results · Betting slips+items+idempotency · Wallet (satang) · Instant games: Hilo/Scratch(5-reel Slot)/Kiwi(ยี่กี/VIP/น้ำเต้าปูปลา) · Notifications · Chat (member+admin) · Push (VAPID) · Promo/cashback/points · Responsible gambling · Admin: dashboard/draws/settle/reports/members/roles/settings/banners/audit/security/wallet · Lottery result fetchers (Thai/Lao/Hanoi/Horoscope/stock-removed) · Scheduler (settle/seed/cashback) · Fairness/provably-fair seeds

## 2. ผลการตรวจสอบรายชั้น (สรุป)

| ระบบ | ผล | รายละเอียด |
|---|---|---|
| โครงสร้างโปรเจกต์ | ✅ ผ่าน (พร้อมข้อเสนอแนะ) | module ชัดเจน, ไม่มีไฟล์ขาด; มีสคริปต์ fix ครั้งเดียว ~60 ไฟล์ที่ root ควรย้าย/ลบ |
| Frontend | ⚠️ ผ่านพร้อมข้อค้นพบ | flow หลักทำงาน; พบ deposit พังบน LAN (แก้แล้วรอบนี้) |
| Backend routes/services | ✅ ผ่าน | audit รอบก่อนแก้ 8 จุดสำคัญแล้ว; live smoke test ผ่าน |
| API | ✅ ผ่าน | ทุก protected endpoint คืน 401/403 ถูกต้อง; IDOR slip ป้องกัน (404) |
| Database | ⚠️ ผ่านพร้อมปัญหา | integrity ok, FK ok, ไม่มี orphan/ยอดติดลบ — แต่มี 35 pending items บน draw ที่ปิดแล้ว |
| Flow | ✅ ผ่าน | bet→draw→result→settle→wallet→notify ครบวงจร (ตรวจละเอียดรอบก่อน) |
| Security | ⚠️ ผ่านพร้อมช่องโหว่เล็ก | CSRF/session/RBAC/password hashing ถูก; ดู SECURITY_AUDIT.md |
| Performance | ⚠️ ผ่านพร้อมข้อเสนอแนะ | SSE poll ทุก ~5s ทุก client; bundle 556KB; ไม่มี rate limit เฉพาะ endpoint |

## 3. ข้อผิดพลาดที่พบ (สรุป — รายละเอียดใน BUG_REPORT.md)

| # | ปัญหา | ระดับ | สถานะ |
|---|---|---|---|
| B-01 | `crypto.randomUUID()` พังบน http://LAN-IP → เติม/ถอนเงินไม่ได้ | สูง | ✅ แก้แล้วรอบนี้ |
| B-02 | 35 bet_items `pending` บน draw สถานะ closed/settled — ค้างไม่มีวัน settle | กลาง | ❌ ยังไม่แก้ (รอตัดสินใจ) |
| B-03 | ตั๋วเกมด่วนซื้อแล้วไม่เล่น → เครดิตล็อกถาวร | กลาง | แสดงในรายงานแล้ว; ยังไม่มี auto-refund |
| B-04 | `updateDrawResult` ข้าม user ที่เงินไม่พอหัก diff โดยไม่แจ้ง | ต่ำ | by design, demo-acceptable |
| B-05 | GET `/api/me/responsible-gambling` = 404 (มีแค่ PATCH) | ต่ำ | ไม่ใช่บั๊กถ้า frontend ใช้ PATCH ถูก |
| B-06 | สคริปต์ fix ครั้งเดียว ~60 ไฟล์ที่ repo root | ข้อเสนอแนะ | ควรย้ายเข้า `scripts/` หรือ `tools/` |
| B-07 | Bundle หลัก 556KB (เกิน Vite warning 500KB) | ข้อเสนอแนะ | พิจารณา code-split หนักๆ ทีหลัง |

## 4. รายการที่ยังไม่ได้ตรวจสอบ (ตรวจไม่ได้/จำกัดขอบเขต)

- **Mobile Safari/real device** — ทดสอบผ่าน headless Chrome + CDP เท่านั้น
- **LINE Login callback จริง** — มี route แต่ไม่ได้ทดสอบกับ LINE จริง (ต้องมี channel secret)
- **Push notification จริง** — service worker/VAPID โค้ดถูกแต่ไม่ได้ทดสอบ end-to-end บน device
- **Load test พร้อมกันหลักร้อย user** — ไม่มี load test; SQLite + single process อาจเป็น bottleneck
- **Third-party lib vulnerabilities** — ไม่ได้รัน `npm audit` เต็มรูปแบบ (ทำได้ถ้าต้องการ)
- **HTTPS/TLS** — deploy เป็น http:// LAN/local เท่านั้น ไม่มี TLS layer
- **Backups/DR** — มี `server/data/backups/` แต่ไม่ได้ทดสอบ restore จริง
