-- 029: admin back office phase 1 — maker-checker approvals, admin user mgmt perms, auth events
-- PostgreSQL dialect — migrate.js รันไฟล์ .pg.sql จริงบน DB เดิม (ไฟล์ .sql คือ SQLite legacy marker)

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

-- auth events — login/logout history ต่อ user (รองรับ player risk + admin audit)
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

-- permissions ใหม่สำหรับ admin back office
INSERT INTO permissions (code, description) VALUES
  ('approvals.view',   'ดูศูนย์อนุมัติ (maker-checker)'),
  ('approvals.approve','อนุมัติ/ปฏิเสธคำขอที่รออยู่'),
  ('admin.users.manage','จัดการบัญชีผู้ดูแลระบบ (สร้าง/ปิด/MFA reset)')
ON CONFLICT (code) DO NOTHING;

-- grant: approvals.* ให้ทั้ง super_admin และ admin (checker คนที่สองต้อง approve ได้)
-- admin.users.manage ให้เฉพาะ super_admin (least privilege — admin ธรรมดาไม่จัดการ admin ได้)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('approvals.view','approvals.approve')
WHERE r.name IN ('super_admin','admin')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = 'admin.users.manage'
WHERE r.name = 'super_admin'
ON CONFLICT DO NOTHING;
