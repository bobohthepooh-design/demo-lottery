-- 038: admin IP allowlist setting (ว่าง = อนุญาตทุก IP)
INSERT INTO system_settings (key, value) VALUES ('admin_allowed_ips', '[]')
ON CONFLICT (key) DO NOTHING;
