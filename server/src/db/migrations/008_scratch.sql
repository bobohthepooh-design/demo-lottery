-- หวยขูด (scratch card) — บัตร instant-win ที่ซื้อแล้วขูดทันที
CREATE TABLE IF NOT EXISTS scratch_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  slip_id INTEGER NOT NULL,
  grid TEXT NOT NULL,            -- JSON array 9 สัญลักษณ์ (emoji)
  outcome TEXT NOT NULL,         -- JSON {win, symbol, prize} — คำนวณจาก grid ตอนเปิดเผย
  status TEXT NOT NULL DEFAULT 'hidden',  -- hidden | revealed
  revealed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_scratch_user ON scratch_cards(user_id, status);
