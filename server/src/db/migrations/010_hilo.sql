-- ไฮโลเต๋า — ทายลูกเต๋าถัดไปสูงกว่า/ต่ำกว่า (instant)
CREATE TABLE IF NOT EXISTS hilo_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  slip_id INTEGER NOT NULL,
  die1 INTEGER NOT NULL,          -- หน้าเต๋าที่เห็น (1-6)
  die2 INTEGER NOT NULL,          -- หน้าเต๋าที่ซ่อน — สุ่มตอนซื้อ เปิดเผยตอนทาย
  pick TEXT,                      -- 'high' | 'low' | NULL (ยังไม่ทาย)
  status TEXT NOT NULL DEFAULT 'awaiting',  -- awaiting | revealed
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revealed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_hilo_user ON hilo_tickets(user_id, status);
