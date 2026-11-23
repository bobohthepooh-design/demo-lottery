-- 034: incident management + retention policy settings
CREATE TABLE IF NOT EXISTS incidents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','mitigated','resolved')),
  detail TEXT,
  created_by BIGINT REFERENCES users(id),
  resolved_by BIGINT REFERENCES users(id),
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS')),
  updated_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS'))
);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status, id DESC);

-- retention: ลบ security_events/auth_events เก่ากว่า N วัน (audit_logs ลบเฉพาะแถว legacy ที่ไม่มี hash)
INSERT INTO system_settings (key, value) VALUES
  ('retention_security_days', '90'),
  ('retention_auth_events_days', '180'),
  ('retention_audit_legacy_days', '365')
ON CONFLICT (key) DO NOTHING;
