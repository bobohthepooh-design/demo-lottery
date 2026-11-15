# DATABASE AUDIT — รายงานตรวจสอบฐานข้อมูล

DB: `server/data/demo-lottery.db` (SQLite, better-sqlite3/node:sqlite) — 28 tables, migrations 001–022

## 1. ผลตรวจสอบความสมบูรณ์ (รันจริง)

| เช็ค | ผล |
|---|---|
| `PRAGMA integrity_check` | ✅ `ok` |
| `PRAGMA foreign_key_check` | ✅ ไม่มี violation |
| Orphan `bet_items` (ไม่มี slip) | ✅ 0 |
| Orphan `bet_slips` (ไม่มี draw) | ✅ 0 |
| Orphan `kiwi_tickets` | ✅ 0 |
| Wallet balance ติดลบ | ✅ 0 |
| `slip_ref` ซ้ำ | ✅ 0 |
| Users ทั้งหมดมี wallet | ✅ (6 users / 6 wallets) |

## 2. สถานะข้อมูลจริง

| ตาราง | จำนวน | หมายเหตุ |
|---|---|---|
| users | 6 | test/admin/demo |
| user_sessions active | 9 | รวม test sessions |
| bet_slips | 584 | pending 23, won 134, lost 422, partial 1, cancelled 4 |
| bet_items | 852 | pending 174, won 135, lost 484, cancelled 59 |
| lottery_draws | 274 | settled 232, open 36, closed 6 |

## 3. ⚠️ ปัญหาที่พบ

### DB-01 (กลาง) — 35 bet_items `pending` บน draw ที่ไม่ open แล้ว
```sql
bet_items.status='pending' JOIN draws WHERE d.status IN ('closed','settled','cancelled') → 35 rows
```
- **สาเหตุ:** settle/cancel บาง path ไม่ได้ mark items ครบทุกตัว (หรือ draw ถูกปิดก่อน items สร้างจบ)
- **ผลกระทบ:** "ยอดค้างรอผล" ในรายงานสูงเกินจริง; withdrawable pending lock อาจค้าง
- **แนวทางแก้:** backfill script mark items ตาม slip status หรือ force-settle draw เหล่านั้น (admin action)
- **ทดสอบหลังแก้:** query เดิมต้อง = 0; รายงาน pending ลดลงตรงกับความจริง

### DB-02 (ต่ำ) — instant-game tickets ไม่ผูก draw จริง
- `kiwi_tickets`/`hilo`/`scratch` ใช้ standing draw (`KI-STANDING` ฯลฯ) — by design
- ticket `awaiting` (ซื้อแล้วยังไม่เล่น) ไม่มีวันหมดอายุ → funds lock ถาวร (ดู BUG_REPORT B-03)

### DB-03 (ข้อเสนอแนะ) — index coverage
- มี index บน FK หลัก + `slip_ref` unique + `idempotency_key` unique + session expiry
- ควรเพิ่ม composite index `(status, draw_id)` บน `bet_items` ถ้ารายงานโต — ตอนนี้ data เล็กไม่จำเป็น

## 4. Migrations
- 22 migrations, additive ล้วน (ไม่มี destructive)
- `migrate.js` run on boot; idempotent
- `demo-data.js`/`seed*.js` ใช้เฉพาะ env demo

## 5. ข้อสังเกต
- ไม่มี `PRAGMA journal_mode=WAL` ชัดเจนใน config — SQLite default DELETE; single-process demo OK แต่ถ้าจะ scale ควร WAL + busy_timeout
- ไม่มี encryption at rest (demo-acceptable)
- `virtual_transactions` ไม่มี FK ไป wallet — by design (audit log แยก)
