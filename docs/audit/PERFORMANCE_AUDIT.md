# PERFORMANCE AUDIT — รายงานตรวจสอบประสิทธิภาพและความเสถียร

## 1. Stack ที่เกี่ยวข้อง
- Express + better-sqlite3 (sync, single-process)
- React SPA + SSE polling + service worker (push)
- Scheduler `setInterval` 1 นาที

## 2. ผลวัด/สังเกตจริง

| รายการ | ผล | หลักฐาน |
|---|---|---|
| API response (public) | ✅ เร็ว | `/health` `/markets` `/results` ตอบ <50ms ในเครื่อง |
| DB query | ✅ เร็ว | integrity_check + audit queries รันทันทีบน 852 items/274 draws |
| Concurrent requests | ⚠️ ไม่ได้ load-test | SQLite single-writer; demo load ต่ำ — ไม่พบปัญหาในทางปฏิบัติ |
| Memory | ✅ ไม่มี leak ชัด | process เดียว; SSE clients ถูก cleanup เมื่อ disconnect |
| Scheduler overlap | ✅ กันแล้ว | `settleRunning` flag + awaited fetch |

## 3. จุดที่อาจเป็น bottleneck (เรียงตามผลกระทบ)

| # | ระดับ | รายละเอียด |
|---|---|---|
| P-01 | กลาง | **SSE poll ทุก ~5s ต่อ client** — ถ้าผู้ใช้พร้อมกันเยอะ connection ค้างเยอะ; พิจารณา EventSource แทน poll หรือ backoff |
| P-02 | กลาง | **Bundle 556KB** (Vite warning) — โหลดช้าบนเน็ตอ่อน/มือถือ; แนะนำ lazy-load หนักๆ (admin charts, slot assets) |
| P-03 | ต่ำ | `listDraws`/`listBets` ไม่มี pagination — ข้อมูลโตแล้วจะช้า; ตอนนี้ ~850 items ยัง OK |
| P-04 | ต่ำ | `SELECT *` บาง query ดึง column เกินจำเป็น (เช่น bets join rules) — impact ต่ำ |
| P-05 | ข้อเสนอแนะ | SQLite `journal_mode` ไม่ได้ set WAL — ถ้าจะรองรับ write พร้อมกันควร `PRAGMA journal_mode=WAL; busy_timeout=5000` |
| P-06 | ข้อเสนอแนะ | ไม่มี caching layer — settings/lottery types ถูก query บ่อย; in-memory cache 30-60s ช่วยได้ |
| P-07 | ข้อเสนอแนะ | `resultFetcher` fetch ภายนอกทุก 1 นาที — ถ้า source ช้าอาจ block event loop (sync sqlite + await fetch ไม่ block แต่ fetch เองมี timeout?) |

## 4. Stability
- ✅ errorHandler กลาง catch async errors
- ✅ process ไม่ crash จาก test requests
- ⚠️ ไม่มี graceful shutdown handler (SIGTERM) — restart อาจตัด request ค้าง (ระดับต่ำสำหรับ demo)
- ⚠️ ไม่มี healthcheck ลึก (DB writable) — `/health` แค่ liveness

## 5. สรุป
ระบบเสถียรและเร็วพอสำหรับ demo/LAN scope ประสิทธิภาพหลักที่ควรปรับในอนาคต: bundle size + SSE scaling + pagination เมื่อข้อมูลโต
