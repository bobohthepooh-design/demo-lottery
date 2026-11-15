-- เพิ่ม type 'promo_cashback' สำหรับเครดิตคืนยอดเสีย (promoService)
-- SQLite ไม่สามารถ ALTER CHECK constraint ได้ จึง rebuild ตาราง
CREATE TABLE virtual_transactions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT NOT NULL UNIQUE,
  wallet_id INTEGER NOT NULL REFERENCES virtual_wallets(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('initial_credit','admin_adjust','admin_debit','bet_debit','bet_refund','win_credit','deposit','withdraw','promo_cashback')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  balance_after INTEGER NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('credit','debit')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','completed','failed','reversed')),
  idempotency_key TEXT UNIQUE,
  description TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO virtual_transactions_new SELECT * FROM virtual_transactions;
DROP TABLE virtual_transactions;
ALTER TABLE virtual_transactions_new RENAME TO virtual_transactions;
CREATE INDEX idx_vtx_wallet ON virtual_transactions(wallet_id, created_at);
CREATE INDEX idx_vtx_user ON virtual_transactions(user_id, created_at);
