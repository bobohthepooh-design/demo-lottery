-- relabel ผลจำลองบนรอบ DEMO: 'auto' (legacy backfill จาก migration 004) → 'demo'
-- ให้ตรง semantic ใหม่: demo/internal แยกจาก external จริง
-- (fairnessForSource รายงาน method='demo' สำหรับ source 'demo'/'auto' หรือ draw_code ที่มี DEMO)
UPDATE lottery_results SET source = 'demo'
WHERE source = 'auto'
  AND draw_id IN (SELECT id FROM lottery_draws WHERE draw_code LIKE '%DEMO%');
