-- 018: promotions (cashback), push subscriptions, user timezone/language prefs

INSERT OR IGNORE INTO system_settings (key, value) VALUES ('cashback_percent', '0');

ALTER TABLE users ADD COLUMN timezone TEXT;
ALTER TABLE users ADD COLUMN language TEXT;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);
