CREATE TABLE IF NOT EXISTS payment_requests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  user_id BIGINT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('deposit','withdraw')),
  amount BIGINT NOT NULL,               -- satang
  method TEXT NOT NULL DEFAULT 'promptpay',
  status TEXT NOT NULL DEFAULT 'pending_slip'
    CHECK (status IN ('pending_slip','pending_review','approved','rejected')),
  promptpay_payload TEXT,
  promptpay_id TEXT,
  slip_trans_ref TEXT,
  slip_amount BIGINT,
  slip_payer TEXT,
  slip_receiver TEXT,
  slip_datetime TEXT,
  slip_raw TEXT,
  slip_error TEXT,
  bank_name TEXT,
  bank_account_no TEXT,
  bank_account_name TEXT,
  admin_note TEXT,
  reviewed_by BIGINT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS')),
  updated_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS'))
);
CREATE INDEX IF NOT EXISTS idx_payment_requests_user ON payment_requests(user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON payment_requests(status, kind);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_requests_slipref ON payment_requests(slip_trans_ref) WHERE slip_trans_ref IS NOT NULL;
