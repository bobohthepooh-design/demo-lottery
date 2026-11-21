-- password reset tokens + draw result source verification (port จาก prototype)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  request_ip TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS draw_result_sources (
  draw_id BIGINT NOT NULL REFERENCES lottery_draws(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_role TEXT NOT NULL CHECK (source_role IN ('official','primary','backup')),
  source_url TEXT NOT NULL,
  result_date TEXT,
  winning_numbers TEXT,
  verification_status TEXT NOT NULL CHECK (verification_status IN ('matched','mismatch','unverified','unavailable','date_mismatch')),
  error TEXT,
  checked_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')),
  last_available_at TEXT,
  PRIMARY KEY (draw_id, source)
);
CREATE INDEX IF NOT EXISTS idx_draw_result_sources_draw ON draw_result_sources(draw_id, source_role);
