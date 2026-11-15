# BUG REPORT — รายการข้อผิดพลาดทั้งหมด

| ID | ชื่อ | ระดับ | ไฟล์ | สถานะ | รายละเอียด |
|---|---|---|---|---|---|
| B-01 | `crypto.randomUUID()` พังบน http://LAN-IP → เติม/ถอนเงินไม่ได้ | สูง | `client/src/pages/Wallet.jsx:93` | ✅ แก้แล้ว | secure-context API undefined บน non-https; เติม/ถอน error ทุกครั้งบน LAN; เพิ่ม fallback แล้ว |
| B-02 | 35 bet_items `pending` บน draw closed/settled/cancelled | กลาง | DB | ✅ ตรวจแล้วไม่ใช่บั๊ก | draw `closed` = ปิดรับแต่ยังไม่ถึงเวลาออกผล → pending ถูกต้อง; standing draws (SC/HL/KI) เป็นตั๋วยังไม่เล่น → แก้ด้วย B-03 |
| B-03 | ตั๋วเกมด่วนซื้อแล้วไม่เล่น → เครดิตล็อกถาวร | กลาง | `hiloService`/`scratchService` | ✅ แก้แล้ว | เพิ่ม `POST /hilo/:id/cancel` + `/scratch/:id/cancel` (refund atomic+notify+audit) + ปุ่มยกเลิกใน history ทั้ง 2 หน้า; ทดสอบจริง: refund 5000 satang เข้า balance, double-cancel ถูก block |
| B-04 | `updateDrawResult` ข้าม user ที่เงินไม่พอหัก diff เงียบๆ | ต่ำ | `resultFetcher.js` | ✅ แก้แล้ว | เพิ่ม audit `result_update.skipped_debit` ทุกครั้งที่ข้าม |
| B-05 | `GET /api/me/responsible-gambling` = 404 | ต่ำ | `server/src/routes/auth.js` | ✅ ไม่ใช่บั๊ก | มีเฉพาะ PATCH; frontend ใช้ PATCH ถูก |
| B-06 | สคริปต์ fix ครั้งเดียว ~60 ไฟล์ที่ repo root | ข้อเสนอแนะ | root `*.mjs` | ✅ แก้แล้ว | ย้าย 52 ไฟล์ไป `scripts/` (git mv) |
| B-07 | Bundle หลัก 556KB เกิน Vite warning | ข้อเสนอแนะ | `client/vite.config.js` | ✅ แก้แล้ว | manualChunks แยก vendor (182KB) + app (388KB) — app chunk เล็กลง 30% |
| B-08 | CSRF token cache ไม่มี auto-retry เมื่อ cookie หมุน | ต่ำ | `client/src/api.js` | ✅ แก้แล้ว | auto-resetCsrf()+retry ครั้งเดียวเมื่อได้ CSRF_FAILED |
| B-09 | ไม่มี pagination บน bets/audit/members list | ต่ำ | admin routes | ⚠️ ยังไม่แก้ | ข้อมูลเล็กตอนนี้; โตแล้วค่อยทำ |
| B-10 | ไม่มี graceful shutdown (SIGTERM) | ต่ำ | `server/src/index.js` | ✅ แก้แล้ว | server.close() drain + force exit 10s |

## บั๊กที่แก้แล้วใน audit รอบก่อนหน้า (สรุป)
- Admin `listDraws` ไม่เห็นรอบประเภทที่ปิด → แก้ `includeInactiveTypes`
- สร้าง draw ให้ instant types ได้ → block + ซ่อนในฟอร์ม
- `code` lottery type เปลี่ยนได้ → ล็อกเป็น immutable
- Rules ไม่ validate type/duplicate bet_type → เพิ่ม
- Kiwi price settings ตาย → sync 2 ทาง
- Members.jsx ส่ง `password:''` → validate fail
- ลบ member error 500 (chat FK) + orphan → transactional cleanup
- Admin ล็อก/ลบตัวเอง → block
- updateDrawResult ไม่แจ้งเตือน → เพิ่ม notify
- Reports: win-rate นับ pending, drawsSummary ล้น, ยี่กีเก่าโผล่ → แก้ทั้งหมด
- "ถูก 1 ไม่เข้าเงื่อนไข" โชว์ +0.00 เขียว → แก้ข้อความ
- น้ำเต้าปูปลา animation → flash symbols แทน spin
- Historical kiwi ticket กดดูผลในตู้ → เพิ่ม click-to-replay
