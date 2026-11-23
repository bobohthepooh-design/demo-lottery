-- 039: เก็บรูปสลิปที่ member อัปโหลด เพื่อให้ admin ตรวจสอบได้
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS slip_image TEXT;
