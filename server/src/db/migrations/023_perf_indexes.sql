-- P2 performance: composite indexes สำหรับ hot queries
-- bet_slips: admin ค้นหา + member list + idempotency check
CREATE INDEX IF NOT EXISTS idx_slips_user_status ON bet_slips(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_slips_status_created ON bet_slips(status, created_at DESC);
-- bet_items: settle ดึง items ตาม draw+status (มี idx_items_draw แต่ไม่รวม status)
CREATE INDEX IF NOT EXISTS idx_items_draw_status ON bet_items(draw_id, status);
-- notifications: unread count per user
CREATE INDEX IF NOT EXISTS idx_notif_user_unread ON notifications(user_id) WHERE read_at IS NULL;
-- audit: admin filter ตาม entity
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
-- draws: upcoming open draws per type (auto-settle tick ทุก 1 นาที)
CREATE INDEX IF NOT EXISTS idx_draws_type_open_at ON lottery_draws(lottery_type_id, status, draw_at) WHERE status IN ('open','scheduled','closed');
