-- โต๊ดเป็นตัวเลือกต่อรายการแทง (ไม่ใช่ประเภทกติกาแยก)
-- is_tod=1 → ประเมินผลแบบสลับลำดับหลัก จ่ายตาม match_config.tod ของกติกา
ALTER TABLE bet_items ADD COLUMN is_tod INTEGER NOT NULL DEFAULT 0;
