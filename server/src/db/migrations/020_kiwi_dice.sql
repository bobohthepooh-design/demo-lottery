-- น้ำเต้าปูปลา (kiwi_dice) — เพิ่มคอลัมน์ bet_type เก็บรูปแบบการแทง (highlow/oddeven/single/pair/triple)
ALTER TABLE kiwi_tickets ADD COLUMN bet_type TEXT;
