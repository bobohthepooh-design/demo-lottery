-- บันทึกที่มาของผลรางวัล: 'auto' = ระบบดึง/สุ่มอัตโนมัติ, 'manual' = admin กรอกเอง
-- backfill จาก published_by: null = auto-settle, มี user = admin settle
ALTER TABLE lottery_results ADD COLUMN source TEXT;
UPDATE lottery_results SET source = CASE WHEN published_by IS NULL THEN 'auto' ELSE 'manual' END WHERE source IS NULL;
