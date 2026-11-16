import { q, qGet } from '../db/pg.js';
import { sendToUser } from './pushService.js';

// แจ้งเตือนในระบบ — เรียกได้ทั้งใน/นอก transaction (ส่ง db handle ของ tx เข้าไปได้)
// push เป็น fire-and-forget — ไม่ block transaction, ไม่มี sub = no-op
export function notify(userId, { type, title, body = null, link = null }, d = null) {
  if (!userId || !title) return;
  // ใน txAsync: d เป็น facade {prepare} → ใช้ client เดียวกับ tx; นอก tx: ใช้ pool
  const p = d?.prepare
    ? d.prepare('INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)')
        .run(userId, type, String(title).slice(0, 200), body ? String(body).slice(0, 500) : null, link || null)
    : q('INSERT INTO notifications (user_id, type, title, body, link) VALUES ($1,$2,$3,$4,$5)',
        [userId, type, String(title).slice(0, 200), body ? String(body).slice(0, 500) : null, link || null]);
  Promise.resolve(p).catch(e => console.error('[notify] pg insert failed:', e.message));
  sendToUser(userId, { title, body, link }).catch(() => {});
}

export function listForUser(userId, limit = 30) {
  return listForUserPg(userId, limit);
}

async function listForUserPg(userId, limit) {
  return q(`SELECT id, type, title, body, link, read_at, created_at
            FROM notifications WHERE user_id = $1 ORDER BY id DESC LIMIT $2`,
    [userId, Math.min(limit, 100)]);
}

export function unreadCount(userId) {
  return unreadCountPg(userId);
}

async function unreadCountPg(userId) {
  const r = await qGet('SELECT COUNT(*)::int c FROM notifications WHERE user_id = $1 AND read_at IS NULL', [userId]);
  return r.c;
}

export function markRead(userId, ids = null) {
  return markReadPg(userId, ids);
}

async function markReadPg(userId, ids) {
  const { qRun } = await import('../db/pg.js');
  const ts = "to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')";
  if (Array.isArray(ids) && ids.length) {
    const slice = ids.slice(0, 100);
    const ph = slice.map((_, i) => `$${i + 2}`).join(',');
    const r = await qRun(`UPDATE notifications SET read_at = ${ts}
                          WHERE user_id = $1 AND read_at IS NULL AND id IN (${ph})`,
      [userId, ...slice]);
    return r.changes;
  }
  const r = await qRun(`UPDATE notifications SET read_at = ${ts}
                        WHERE user_id = $1 AND read_at IS NULL`, [userId]);
  return r.changes;
}
