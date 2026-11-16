-- P3: member bet list สแกน pkey ย้อนแล้ว filter user_id (ลบแถวทิ้งเยอะ)
-- → index (user_id, id DESC) ให้ดึง 50 ล่าสุดของ user ตรงๆ
CREATE INDEX IF NOT EXISTS idx_slips_user_id_desc ON bet_slips(user_id, id DESC);
