-- 030: payment limits settings — ให้ปรากฏใน Settings UI บน DB เดิม (seed รันเฉพาะ DB เปล่า)
INSERT INTO system_settings (key, value, updated_at)
SELECT v.key, v.value, to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')
FROM (VALUES
  ('deposit_min_baht',   '1'),
  ('deposit_max_baht',   '1000000'),
  ('withdraw_min_baht',  '100'),
  ('withdraw_max_baht',  '1000000')
) AS v(key, value)
ON CONFLICT (key) DO NOTHING;
