-- 028: security & membership hardening
-- terms consent record, email verification, signup ip (promo-abuse guard), OTP channel (phone|email)
ALTER TABLE users ADD COLUMN terms_accepted_at TEXT;
ALTER TABLE users ADD COLUMN terms_version TEXT;
ALTER TABLE users ADD COLUMN email_verified BIGINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN signup_ip TEXT;

ALTER TABLE otp_codes ADD COLUMN channel TEXT NOT NULL DEFAULT 'phone';

CREATE TABLE IF NOT EXISTS email_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_email_verify_user ON email_verifications(user_id, created_at);
