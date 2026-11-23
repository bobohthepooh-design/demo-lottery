-- PostgreSQL schema (FK-safe order)
BEGIN;

CREATE TABLE users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','locked','disabled')),
  failed_login_count BIGINT NOT NULL DEFAULT 0,
  locked_until TEXT,
  mfa_secret TEXT,
  mfa_enabled BIGINT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS')),
  updated_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS'))
, withdraw_unlocked BIGINT NOT NULL DEFAULT 0, phone TEXT, self_excluded_until TEXT, daily_limit_satang BIGINT, monthly_limit_satang BIGINT, age_confirmed BIGINT DEFAULT 0, timezone TEXT, language TEXT, terms_accepted_at TEXT, terms_version TEXT, email_verified BIGINT NOT NULL DEFAULT 0, signup_ip TEXT
, kyc_status TEXT NOT NULL DEFAULT 'none', kyc_requested_at TEXT, kyc_reviewed_by BIGINT, kyc_reviewed_at TEXT, kyc_note TEXT);

CREATE TABLE roles (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE permissions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE role_permissions (
  role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE user_sessions (
  id TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip TEXT,
  user_agent TEXT,
  mfa_verified BIGINT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE password_reset_tokens (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  request_ip TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE virtual_wallets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  version BIGINT NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS'))
);

CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS')),
  updated_by BIGINT REFERENCES users(id)
);

CREATE TABLE lottery_types (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name_th TEXT NOT NULL,
  name_en TEXT,
  description TEXT,
  is_active BIGINT NOT NULL DEFAULT 1
, result_mode TEXT NOT NULL DEFAULT 'auto' CHECK (result_mode IN ('auto','manual')));

CREATE TABLE lottery_categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lottery_type_id BIGINT NOT NULL REFERENCES lottery_types(id),
  code TEXT NOT NULL,
  name_th TEXT NOT NULL,
  draw_pattern TEXT,
  is_active BIGINT NOT NULL DEFAULT 1,
  UNIQUE (lottery_type_id, code)
);

CREATE TABLE lottery_rules (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lottery_type_id BIGINT NOT NULL REFERENCES lottery_types(id),
  category_id BIGINT REFERENCES lottery_categories(id),
  bet_type TEXT NOT NULL,
  name_th TEXT NOT NULL,
  name_en TEXT,
  digits BIGINT NOT NULL,
  match_config TEXT NOT NULL,
  payout_multiplier REAL NOT NULL DEFAULT 0,
  stake_unit BIGINT NOT NULL DEFAULT 1,
  min_amount BIGINT NOT NULL DEFAULT 1,
  max_amount BIGINT,
  is_active BIGINT NOT NULL DEFAULT 1
);

CREATE TABLE lottery_draws (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lottery_type_id BIGINT NOT NULL REFERENCES lottery_types(id),
  category_id BIGINT REFERENCES lottery_categories(id),
  draw_code TEXT NOT NULL UNIQUE,
  draw_at TEXT NOT NULL,
  close_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','open','closed','settled','cancelled')),
  result_numbers TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS')),
  updated_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS'))
, announce TEXT);

CREATE TABLE lottery_results (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  draw_id BIGINT NOT NULL UNIQUE REFERENCES lottery_draws(id),
  winning_numbers TEXT NOT NULL,
  published_by BIGINT REFERENCES users(id),
  published_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS'))
, source TEXT);

CREATE TABLE draw_result_sources (
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

CREATE TABLE bet_slips (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slip_ref TEXT NOT NULL UNIQUE,
  user_id BIGINT NOT NULL REFERENCES users(id),
  draw_id BIGINT NOT NULL REFERENCES lottery_draws(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','won','lost','partial','cancelled','refunded')),
  total_stake BIGINT NOT NULL DEFAULT 0,
  total_payout BIGINT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS')),
  settled_at TEXT
, idempotency_key TEXT);

CREATE TABLE bet_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slip_id BIGINT NOT NULL REFERENCES bet_slips(id) ON DELETE CASCADE,
  draw_id BIGINT NOT NULL REFERENCES lottery_draws(id),
  rule_id BIGINT NOT NULL REFERENCES lottery_rules(id),
  bet_type TEXT NOT NULL,
  number TEXT NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','won','lost','cancelled')),
  payout BIGINT NOT NULL DEFAULT 0,
  result_detail TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS'))
, is_tod BIGINT NOT NULL DEFAULT 0, payout_multiplier REAL, match_config TEXT);

CREATE TABLE hilo_tickets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL,
  slip_id BIGINT NOT NULL,
  die1 BIGINT NOT NULL,          -- หน้าเต๋าที่เห็น (1-6)
  die2 BIGINT NOT NULL,          -- หน้าเต๋าที่ซ่อน — สุ่มตอนซื้อ เปิดเผยตอนทาย
  pick TEXT,                      -- 'high' | 'low' | NULL (ยังไม่ทาย)
  status TEXT NOT NULL DEFAULT 'awaiting',  -- awaiting | revealed
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS')),
  revealed_at TEXT
, die3 BIGINT, server_seed TEXT, commit_hash TEXT);

CREATE TABLE scratch_cards (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL,
  slip_id BIGINT NOT NULL,
  grid TEXT NOT NULL,            -- JSON array 9 สัญลักษณ์ (emoji)
  outcome TEXT NOT NULL,         -- JSON {win, symbol, prize} — คำนวณจาก grid ตอนเปิดเผย
  status TEXT NOT NULL DEFAULT 'hidden',  -- hidden | revealed
  revealed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS'))
, server_seed TEXT, commit_hash TEXT);

CREATE TABLE kiwi_tickets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL,
  slip_id BIGINT NOT NULL,
  game TEXT NOT NULL,             -- kiwi | kiwi_vip | kiwi_zodiac
  picks TEXT NOT NULL,            -- JSON array เลข/ราศีที่ผู้เล่นเลือก
  drawn TEXT NOT NULL,            -- JSON array ผลที่ server สุ่ม (ซ่อนจนกว่า reveal — reveal ทันทีใน play)
  hits BIGINT NOT NULL DEFAULT 0,
  payout BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'revealed',  -- revealed (จบในคำขอเดียว)
  server_seed TEXT NOT NULL,
  commit_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS')),
  revealed_at TEXT
, bet_type TEXT);

CREATE TABLE notifications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL,
  type TEXT NOT NULL,               -- 'win' | 'credit' | 'deposit' | 'withdraw' | 'refund' | 'system'
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,                        -- path ภายใน เช่น /my-bets
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS'))
);

CREATE TABLE otp_codes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('register','login')),
  expires_at TEXT NOT NULL,
  used BIGINT NOT NULL DEFAULT 0,
  attempts BIGINT NOT NULL DEFAULT 0,
  ip TEXT,
  channel TEXT NOT NULL DEFAULT 'phone',
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS'))
);

CREATE TABLE push_subscriptions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS')),
  last_seen_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS'))
);

CREATE TABLE chat_threads (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS')),
  last_msg_at TEXT
);

CREATE TABLE chat_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  thread_id BIGINT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  sender_id BIGINT NOT NULL REFERENCES users(id),
  is_admin BIGINT NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS')),
  read_by_admin BIGINT NOT NULL DEFAULT 0,
  read_by_user BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  detail TEXT,
  ip TEXT,
  user_agent TEXT,
  correlation_id TEXT,
  prev_hash TEXT,
  hash TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS'))
);
CREATE INDEX IF NOT EXISTS idx_audit_correlation ON audit_logs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_filters ON audit_logs(action, entity_type, created_at);

CREATE TABLE security_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  user_id BIGINT REFERENCES users(id),
  ip TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS'))
);

CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());

CREATE TABLE "virtual_transactions" (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  wallet_id BIGINT NOT NULL REFERENCES virtual_wallets(id),
  user_id BIGINT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('initial_credit','admin_adjust','admin_debit','bet_debit','bet_refund','win_credit','deposit','withdraw','promo_cashback')),
  amount BIGINT NOT NULL CHECK (amount > 0),
  balance_after BIGINT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('credit','debit')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','completed','failed','reversed')),
  idempotency_key TEXT UNIQUE,
  description TEXT,
  created_by BIGINT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS'))
);

CREATE INDEX idx_audit_action ON audit_logs(action, created_at);

CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at);

CREATE UNIQUE INDEX idx_bet_slips_user_idem
  ON bet_slips(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX idx_chat_messages_thread ON chat_messages(thread_id, id);

CREATE INDEX idx_chat_threads_last ON chat_threads(last_msg_at DESC);

CREATE INDEX idx_draws_close ON lottery_draws(close_at);

CREATE INDEX idx_draws_type_status ON lottery_draws(lottery_type_id, status);
CREATE INDEX idx_draw_result_sources_draw ON draw_result_sources(draw_id, source_role);

CREATE INDEX idx_hilo_user ON hilo_tickets(user_id, status);

CREATE INDEX idx_items_draw ON bet_items(draw_id, status);

CREATE INDEX idx_items_slip ON bet_items(slip_id);

CREATE INDEX idx_kiwi_user ON kiwi_tickets(user_id, id);

CREATE INDEX idx_notif_user ON notifications(user_id, read_at, id);

CREATE INDEX idx_otp_phone ON otp_codes(phone, purpose, created_at);

CREATE INDEX idx_push_subs_user ON push_subscriptions(user_id);

CREATE UNIQUE INDEX idx_rules_uniq ON lottery_rules(lottery_type_id, COALESCE(category_id, 0), bet_type);

CREATE INDEX idx_scratch_user ON scratch_cards(user_id, status);

CREATE INDEX idx_secevents_type ON security_events(event_type, created_at);

CREATE INDEX idx_sessions_expires ON user_sessions(expires_at);

CREATE INDEX idx_sessions_user ON user_sessions(user_id);

CREATE INDEX idx_slips_draw ON bet_slips(draw_id, status);

CREATE INDEX idx_slips_user ON bet_slips(user_id, created_at);

CREATE INDEX idx_slips_user_id_desc ON bet_slips(user_id, id DESC);
CREATE INDEX idx_slips_user_status ON bet_slips(user_id, status, created_at DESC);
CREATE INDEX idx_slips_status_created ON bet_slips(status, created_at DESC);
CREATE INDEX idx_items_draw_status ON bet_items(draw_id, status);
CREATE INDEX idx_notif_user_unread ON notifications(user_id) WHERE read_at IS NULL;
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_draws_type_open_at ON lottery_draws(lottery_type_id, status, draw_at) WHERE status IN ('open','scheduled','closed');

CREATE UNIQUE INDEX idx_users_phone ON users(phone) WHERE phone IS NOT NULL;

CREATE INDEX idx_users_status ON users(status);

CREATE INDEX idx_vtx_user ON virtual_transactions(user_id, created_at);

CREATE INDEX idx_vtx_wallet ON virtual_transactions(wallet_id, created_at);

COMMIT;

CREATE TABLE IF NOT EXISTS payment_requests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  user_id BIGINT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('deposit','withdraw')),
  amount BIGINT NOT NULL,
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
  slip_image TEXT,
  slip_image_path TEXT,
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

CREATE TABLE IF NOT EXISTS email_verifications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS'))
);
CREATE INDEX IF NOT EXISTS idx_email_verify_user ON email_verifications(user_id, created_at);

-- 029: admin back office — maker-checker approvals + auth events
CREATE TABLE IF NOT EXISTS approval_requests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  payload TEXT NOT NULL,
  summary TEXT NOT NULL,
  maker_id BIGINT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','executed','failed','cancelled')),
  checker_id BIGINT REFERENCES users(id),
  checker_note TEXT,
  decided_at TEXT,
  executed_at TEXT,
  execution_result TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS')),
  updated_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS'))
);
CREATE INDEX IF NOT EXISTS idx_approval_status ON approval_requests(status, category, id DESC);
CREATE INDEX IF NOT EXISTS idx_approval_maker ON approval_requests(maker_id, id DESC);

CREATE TABLE IF NOT EXISTS auth_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS'))
);
CREATE INDEX IF NOT EXISTS idx_auth_events_user ON auth_events(user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_auth_events_ip ON auth_events(ip, id DESC);

CREATE TABLE IF NOT EXISTS support_tickets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'general',
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  admin_reply TEXT,
  admin_id BIGINT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS')),
  updated_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS')),
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tickets_user ON support_tickets(user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status, id DESC);

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

CREATE TABLE IF NOT EXISTS journal_entries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transaction_id BIGINT NOT NULL REFERENCES virtual_transactions(id) ON DELETE CASCADE,
  account TEXT NOT NULL,
  debit BIGINT NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit BIGINT NOT NULL DEFAULT 0 CHECK (credit >= 0),
  CHECK (debit = 0 OR credit = 0),
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS'))
);
CREATE INDEX IF NOT EXISTS idx_journal_tx ON journal_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_journal_account ON journal_entries(account);

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
