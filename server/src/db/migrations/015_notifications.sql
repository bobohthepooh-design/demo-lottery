-- In-app notifications (ผลรางวัล/เครดิตเข้า) — demo only
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,               -- 'win' | 'credit' | 'deposit' | 'withdraw' | 'refund' | 'system'
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,                        -- path ภายใน เช่น /my-bets
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at, id);
