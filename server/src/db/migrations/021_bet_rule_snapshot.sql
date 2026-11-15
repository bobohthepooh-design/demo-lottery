-- Snapshot อัตราจ่าย/กติกาของกติกาล็อตเตอรี ณ ตอนแทง — กันโพยค้างเปลี่ยนราคาเมื่อ admin แก้กติกา
ALTER TABLE bet_items ADD COLUMN payout_multiplier REAL;
ALTER TABLE bet_items ADD COLUMN match_config TEXT;
