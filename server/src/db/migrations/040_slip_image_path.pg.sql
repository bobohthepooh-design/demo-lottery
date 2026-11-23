-- 040: slip image ย้ายไปเก็บเป็นไฟล์ใน server/data/slips/ (ไม่ฝัง base64 ใน DB)
-- slip_image (TEXT) เก็บไว้สำหรับ row เก่า — row ใหม่ใช้ slip_image_path
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS slip_image_path TEXT;
