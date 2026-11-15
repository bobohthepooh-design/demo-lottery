-- เกมกีวิ (kiwi) + หัวก้อย (coin) — instant games ชุดใหม่
CREATE TABLE IF NOT EXISTS kiwi_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  slip_id INTEGER NOT NULL,
  game TEXT NOT NULL,             -- kiwi | kiwi_vip | kiwi_zodiac
  picks TEXT NOT NULL,            -- JSON array เลข/ราศีที่ผู้เล่นเลือก
  drawn TEXT NOT NULL,            -- JSON array ผลที่ server สุ่ม (ซ่อนจนกว่า reveal — reveal ทันทีใน play)
  hits INTEGER NOT NULL DEFAULT 0,
  payout INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'revealed',  -- revealed (จบในคำขอเดียว)
  server_seed TEXT NOT NULL,
  commit_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revealed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_kiwi_user ON kiwi_tickets(user_id, id);

CREATE TABLE IF NOT EXISTS coin_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  slip_id INTEGER NOT NULL,
  grp TEXT NOT NULL,              -- coin | coin1 | coin2 | coin3 | coin4 (จำนวนครั้งที่ต้องทายถูกติดกัน)
  pick TEXT NOT NULL,             -- 'head' | 'tail'
  flips TEXT NOT NULL,            -- JSON array 0/1 ต่อครั้ง (0=หัว 1=ก้อย)
  won INTEGER NOT NULL DEFAULT 0,
  payout INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'revealed',
  server_seed TEXT NOT NULL,
  commit_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revealed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_coin_user ON coin_tickets(user_id, id);
