-- Idempotency key for bet slip submission (prevents duplicate slips on retry/double-submit)
ALTER TABLE bet_slips ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bet_slips_user_idem
  ON bet_slips(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
