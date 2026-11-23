-- 031: maker_checker setting — ให้ปรากฏใน Settings UI บน DB เดิม (seed รันเฉพาะ DB เปล่า)
-- auto = บังคับ approval เมื่อมี admin ≥2 บัญชี | off = ปิด | always = บังคับเสมอ
INSERT INTO system_settings (key, value, updated_at)
VALUES ('maker_checker', '"auto"', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'))
ON CONFLICT (key) DO NOTHING;
