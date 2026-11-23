-- 033: audit hardening (hash-chain tamper evidence + correlation id) + promotion campaigns
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS correlation_id TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS prev_hash TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS hash TEXT;
CREATE INDEX IF NOT EXISTS idx_audit_correlation ON audit_logs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_filters ON audit_logs(action, entity_type, created_at);

-- promo campaigns — รายการโปรโมชันที่ admin จัดการ (cashback ฯลฯ)
CREATE TABLE IF NOT EXISTS promo_campaigns (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'cashback' CHECK (kind IN ('cashback')),
  percent INTEGER NOT NULL CHECK (percent > 0 AND percent <= 100),
  window_hours INTEGER NOT NULL DEFAULT 24 CHECK (window_hours > 0 AND window_hours <= 720),
  min_satang BIGINT NOT NULL DEFAULT 100,
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0,1)),
  created_by BIGINT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS')),
  updated_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS'))
);
