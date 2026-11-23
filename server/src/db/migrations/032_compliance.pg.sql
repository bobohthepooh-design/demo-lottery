-- 032: compliance phase 3 — KYC manual review + support/dispute tickets + RG admin view
-- PostgreSQL dialect

-- KYC (manual checklist) — member ขอ verify, admin อนุมัติ/ปฏิเสธ
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_requested_at TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_reviewed_by BIGINT REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_reviewed_at TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_note TEXT;
CREATE INDEX IF NOT EXISTS idx_users_kyc_status ON users(kyc_status) WHERE kyc_status <> 'none';

-- support/dispute tickets — member เปิดเรื่อง, admin ตอบ/ปิด
CREATE TABLE IF NOT EXISTS support_tickets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'general',
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  admin_reply TEXT,
  admin_id BIGINT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')),
  updated_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')),
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tickets_user ON support_tickets(user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status, id DESC);
