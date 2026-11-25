-- 042: แก้ column defaults ที่ใช้ to_char format 'HH:MM:SS' (ชั่วโมง 1-12)
-- 'HH' ใน Postgres to_char คือ 12-hour clock — เวลา PM (13:00-23:59 UTC)
-- ถูกเก็บเพี้ยนเป็น 01:00-11:59 (หายไป 12 ชม.) ทำให้ published_at/created_at
-- ที่แสดงบนหน้าเว็บคลาดเคลื่อน — เปลี่ยนเป็น 'HH24:MI:SS' (00-23) ทั้งหมด
-- และ now() → clock_timestamp() ให้ตรงกับ pg.js translate() (เวลาจริง ณ statement)
DO $$
DECLARE
  r record;
  newdef text;
BEGIN
  FOR r IN
    SELECT table_name, column_name, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_default IS NOT NULL
      AND (column_default LIKE '%HH:MM:SS%' OR column_default LIKE '%now()%')
  LOOP
    newdef := replace(r.column_default, 'HH:MM:SS', 'HH24:MI:SS');
    newdef := replace(newdef, 'now()', 'clock_timestamp()');
    IF newdef IS DISTINCT FROM r.column_default THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT %s',
        r.table_name, r.column_name, newdef);
    END IF;
  END LOOP;
END $$;
