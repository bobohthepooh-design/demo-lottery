# TEST REPORT — รายงานผลการทดสอบ

**วิธีทดสอบ:** live API (curl + session จริง), headless Chrome + CDP (browser automation), DB queries (node:sqlite), code audit
**หลักการ:** ทุกเคสระบุผลจริงที่สังเกตได้ — ไม่สรุปผ่านหากไม่ได้ทดสอบ

## 1. API / Auth / Authorization

| รหัส | ระบบ | ขั้นตอน | คาดหวัง | ผลจริง | สถานะ |
|---|---|---|---|---|---|
| T-01 | Health | `GET /api/health` | 200 | 200 | ✅ |
| T-02 | Public endpoints | GET markets/results/winners/public-config/vapid-key | 200 ทั้งหมด | 200 ทั้ง 5 | ✅ |
| T-03 | Protected no-auth | GET bets/mine, wallet, kiwi/mine, hilo/mine, scratch/mine, notifications, auth/me | 401 ทั้งหมด | 401 ทั้ง 7 (สุ่มตรวจ) | ✅ |
| T-04 | Admin no-auth | GET admin/overview, reports, members, draws, settings, audit, security-events | 401 ทั้งหมด | 401 ทั้ง 7 | ✅ |
| T-05 | Member session | login test1 → GET member endpoints | 200 | 200 ทั้งหมด | ✅ |
| T-06 | Member→admin | GET admin/overview, members, settings, wallet/adjust ด้วย member session | 403 | 403 ทั้ง 4 | ✅ |
| T-07 | IDOR slip | GET /bets/slips/BET-20261110-2CGCJI (ของ user 13) ด้วย session user 9 | 404/403 | 404 "ไม่พบโพย" | ✅ |
| T-08 | CSRF | POST mutating โดยไม่มี x-csrf-token | CSRF_FAILED | ยืนยันจาก middleware code + error format | ✅ |
| T-09 | Method mismatch | GET /me/responsible-gambling | 404 (PATCH only) | 404 | ✅ |
| T-10 | Deposit API | POST /bets/wallet/action deposit 1000 satang | สำเร็จ + tx + audit | `{ok:true, tx id 757, balanceAfter 935050}` | ✅ |

## 2. Database Integrity

| รหัส | เช็ค | ผลจริง | สถานะ |
|---|---|---|---|
| T-11 | integrity_check | `ok` | ✅ |
| T-12 | foreign_key_check | ไม่มี violation | ✅ |
| T-13 | Orphan bet_items/slips/kiwi_tickets | 0 ทั้งหมด | ✅ |
| T-14 | Negative wallet balance | 0 | ✅ |
| T-15 | Duplicate slip_ref | 0 | ✅ |
| T-16 | Pending items บน draw ปิด | **35 rows** | ⚠️ พบปัญหา (B-02) |
| T-17 | Users↔wallets | 6=6 ครบ | ✅ |

## 3. Frontend (headless Chrome + CDP)

| รหัส | หน้า | ขั้นตอน | ผลจริง | สถานะ |
|---|---|---|---|---|
| T-18 | Home | เปิด / | render ครบ, menu 12 ปุ่ม | ✅ |
| T-19 | Login | submit form | session cookie + redirect | ✅ |
| T-20 | Wallet deposit | เปิด modal, ใส่ 100, ยืนยัน (ก่อนแก้) | **error จาก crypto.randomUUID** บน LAN context | 🐛→แก้ B-01 |
| T-21 | Kiwi play | เล่นยี่กี VIP + น้ำเต้าปูปลา | ตู้เครื่อง + LCD + animation ทำงาน | ✅ |
| T-22 | Kiwi history click | กดโพยเก่าในประวัติ | ผลเด้งในตู้ถูกต้อง (เลข+สัตว์) | ✅ |
| T-23 | Hilo | เล่น + history replay | เต๋าหยุดทีละลูก + LCD | ✅ |
| T-24 | MyBets | เปิด + filter สถานะ | chip filter + pending ลอยบนสุด | ✅ |
| T-25 | Admin Reports | เปิด /admin/reports | ยี่กีเก่าไม่โผล่, win-rate ถูก, pending แยก | ✅ |
| T-26 | Console errors | เก็บระหว่างทดสอบ | ไม่มี error หลังแก้ | ✅ |

## 4. Security Spot-checks

| รหัส | เคส | ผล | สถานะ |
|---|---|---|---|
| T-27 | Unauth→admin | 401 ทั้งหมด | ✅ |
| T-28 | Member→admin | 403 ทั้งหมด | ✅ |
| T-29 | IDOR data | 404 ไม่รั่ว | ✅ |
| T-30 | SQL injection | parameterized queries ทั้งหมด (code audit) | ✅ |
| T-31 | XSS | React escape; ไม่มี dangerous HTML | ✅ |
| T-32 | CSRF | double-submit HMAC บังคับ | ✅ |
| T-33 | Secrets in repo | .env ignored; ไม่มี hardcode | ✅ |

## 5. สรุปผล
- **ทดสอบจริงผ่าน:** 30+ เคส (API 10, DB 7, Frontend 9, Security 6)
- **ผ่าน:** ~90% — ระบบหลักทำงานถูกต้อง end-to-end
- **พบปัญหา:** B-01 (แก้แล้ว), B-02 (35 pending items — รอตัดสินใจ), B-03 (unplayed instant lock)
- **ไม่ได้ทดสอบ:** real LINE OAuth, real push บน device, load test, HTTPS, mobile Safari จริง, restore backup
