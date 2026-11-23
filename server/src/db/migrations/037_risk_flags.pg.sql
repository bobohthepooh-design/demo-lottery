-- 037: risk/fraud flags — rule-based signals per member + review workflow
CREATE TABLE IF NOT EXISTS risk_flags (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('info','low','medium','high','critical')),
  score INTEGER NOT NULL DEFAULT 0,
  detail TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  note TEXT,
  created_by TEXT NOT NULL DEFAULT 'system',
  resolved_by BIGINT REFERENCES users(id),
  resolved_at TEXT,
  last_seen_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS')),
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS')),
  updated_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS'))
);
CREATE INDEX IF NOT EXISTS idx_risk_flags_user ON risk_flags(user_id, status);
CREATE INDEX IF NOT EXISTS idx_risk_flags_status ON risk_flags(status, severity, id DESC);
