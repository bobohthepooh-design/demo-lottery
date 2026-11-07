-- 001_init.sql — Demo Lottery Platform schema
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE role_permissions (
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','locked','disabled')),
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  mfa_secret TEXT,
  mfa_enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_users_status ON users(status);

CREATE TABLE user_roles (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE user_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip TEXT,
  user_agent TEXT,
  mfa_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX idx_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_sessions_expires ON user_sessions(expires_at);

CREATE TABLE virtual_wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE virtual_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT NOT NULL UNIQUE,
  wallet_id INTEGER NOT NULL REFERENCES virtual_wallets(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('initial_credit','admin_adjust','bet_debit','bet_refund','win_credit','admin_debit')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  balance_after INTEGER NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('credit','debit')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','completed','failed','reversed')),
  idempotency_key TEXT UNIQUE,
  description TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_vtx_wallet ON virtual_transactions(wallet_id, created_at);
CREATE INDEX idx_vtx_user ON virtual_transactions(user_id, created_at);

CREATE TABLE lottery_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name_th TEXT NOT NULL,
  name_en TEXT,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE lottery_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lottery_type_id INTEGER NOT NULL REFERENCES lottery_types(id),
  code TEXT NOT NULL,
  name_th TEXT NOT NULL,
  draw_pattern TEXT,
  UNIQUE (lottery_type_id, code)
);

CREATE TABLE lottery_draws (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lottery_type_id INTEGER NOT NULL REFERENCES lottery_types(id),
  category_id INTEGER REFERENCES lottery_categories(id),
  draw_code TEXT NOT NULL UNIQUE,
  draw_at TEXT NOT NULL,
  close_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','open','closed','settled','cancelled')),
  result_numbers TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_draws_type_status ON lottery_draws(lottery_type_id, status);
CREATE INDEX idx_draws_close ON lottery_draws(close_at);

CREATE TABLE lottery_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lottery_type_id INTEGER NOT NULL REFERENCES lottery_types(id),
  category_id INTEGER REFERENCES lottery_categories(id),
  bet_type TEXT NOT NULL,
  name_th TEXT NOT NULL,
  name_en TEXT,
  digits INTEGER NOT NULL,
  match_config TEXT NOT NULL,
  payout_multiplier REAL NOT NULL DEFAULT 0,
  stake_unit INTEGER NOT NULL DEFAULT 1,
  min_amount INTEGER NOT NULL DEFAULT 1,
  max_amount INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX idx_rules_uniq ON lottery_rules(lottery_type_id, COALESCE(category_id, 0), bet_type);

CREATE TABLE bet_slips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slip_ref TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  draw_id INTEGER NOT NULL REFERENCES lottery_draws(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','won','lost','partial','cancelled','refunded')),
  total_stake INTEGER NOT NULL DEFAULT 0,
  total_payout INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  settled_at TEXT
);
CREATE INDEX idx_slips_user ON bet_slips(user_id, created_at);
CREATE INDEX idx_slips_draw ON bet_slips(draw_id, status);

CREATE TABLE bet_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slip_id INTEGER NOT NULL REFERENCES bet_slips(id) ON DELETE CASCADE,
  draw_id INTEGER NOT NULL REFERENCES lottery_draws(id),
  rule_id INTEGER NOT NULL REFERENCES lottery_rules(id),
  bet_type TEXT NOT NULL,
  number TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','won','lost','cancelled')),
  payout INTEGER NOT NULL DEFAULT 0,
  result_detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_items_draw ON bet_items(draw_id, status);
CREATE INDEX idx_items_slip ON bet_items(slip_id);

CREATE TABLE lottery_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draw_id INTEGER NOT NULL UNIQUE REFERENCES lottery_draws(id),
  winning_numbers TEXT NOT NULL,
  published_by INTEGER REFERENCES users(id),
  published_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  detail TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at);
CREATE INDEX idx_audit_action ON audit_logs(action, created_at);

CREATE TABLE security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  user_id INTEGER REFERENCES users(id),
  ip TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_secevents_type ON security_events(event_type, created_at);

CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by INTEGER REFERENCES users(id)
);
