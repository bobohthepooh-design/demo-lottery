import { getDb } from '../db/index.js';
import { sendToUser } from './pushService.js';

// แจ้งเตือนในระบบ — เรียกได้ทั้งใน/นอก transaction (ส่ง db handle ของ tx เข้าไปได้)
// push เป็น fire-and-forget — ไม่ block transaction, ไม่มี sub = no-op
export function notify(userId, { type, title, body = null, link = null }, d = getDb()) {
  if (!userId || !title) return;
  d.prepare('INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)')
    .run(userId, type, String(title).slice(0, 200), body ? String(body).slice(0, 500) : null, link || null);
  sendToUser(userId, { title, body, link }).catch(() => {});
}

export function listForUser(userId, limit = 30) {
  return getDb().prepare(`SELECT id, type, title, body, link, read_at, created_at
                          FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?`)
    .all(userId, Math.min(limit, 100));
}

export function unreadCount(userId) {
  return getDb().prepare('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read_at IS NULL').get(userId).c;
}

export function markRead(userId, ids = null) {
  if (Array.isArray(ids) && ids.length) {
    const qs = ids.slice(0, 100).map(() => '?').join(',');
    return getDb().prepare(`UPDATE notifications SET read_at = datetime('now')
                            WHERE user_id = ? AND read_at IS NULL AND id IN (${qs})`).run(userId, ...ids).changes;
  }
  return getDb().prepare(`UPDATE notifications SET read_at = datetime('now')
                          WHERE user_id = ? AND read_at IS NULL`).run(userId).changes;
}
