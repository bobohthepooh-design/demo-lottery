-- โหมดการออกรางวัลต่อประเภทหวย: 'auto' = ดึงผลอัตโนมัติจากแหล่งข้อมูล, 'manual' = admin กรอกผลเอง
ALTER TABLE lottery_types ADD COLUMN result_mode TEXT NOT NULL DEFAULT 'auto' CHECK (result_mode IN ('auto','manual'));
