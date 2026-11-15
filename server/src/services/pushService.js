import webpush from 'web-push';
import { getDb, isPg } from '../db/index.js';
import { getSetting, setSetting } from './settingsService.js';
import { q, qGet, qRun, qInsert } from '../db/pg.js';

let vapidReady = false;

// VAPID keys — สร้างครั้งเดียวเก็บใน system_settings (demo — ถ้า production ควรใส่ผ่าน env)
async function ensureVapid() {
  if (vapidReady) return;
  let pub = await getSetting('vapid_public_key');
  let priv = await getSetting('vapid_private_key');
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    pub = k.publicKey; priv = k.privateKey;
    await setSetting('vapid_public_key', pub, null);
    await setSetting('vapid_private_key', priv, null);
  }
  webpush.setVapidDetails('mailto:demo-lottery@localhost', pub, priv);
  vapidReady = true;
}

export async function vapidPublicKey() {
  await ensureVapid();
  return getSetting('vapid_public_key');
}

export async function saveSubscription(userId, sub) {
  const endpoint = String(sub?.endpoint || '');
  const p256dh = String(sub?.keys?.p256dh || '');
  const auth = String(sub?.keys?.auth || '');
  if (!endpoint.startsWith('https://') || !p256dh || !auth) return false;
  if (isPg()) {
    await q(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT(endpoint) DO UPDATE SET user_id = EXCLUDED.user_id,
               p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
               last_seen_at = to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')`,
      [userId, endpoint.slice(0, 1000), p256dh, auth]);
    return true;
  }
  getDb().prepare(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id,
                     p256dh = excluded.p256dh, auth = excluded.auth, last_seen_at = datetime('now')`)
    .run(userId, endpoint.slice(0, 1000), p256dh, auth);
  return true;
}

export async function removeSubscription(userId, endpoint) {
  if (isPg()) {
    await qRun('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
      [userId, String(endpoint || '').slice(0, 1000)]);
    return;
  }
  getDb().prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?')
    .run(userId, String(endpoint || '').slice(0, 1000));
}

export async function subscriptionCount(userId) {
  if (isPg()) {
    const r = await qGet('SELECT COUNT(*)::int c FROM push_subscriptions WHERE user_id = $1', [userId]);
    return r.c;
  }
  return getDb().prepare('SELECT COUNT(*) c FROM push_subscriptions WHERE user_id = ?').get(userId).c;
}

/** ส่ง push ให้สมาชิกทุกอุปกรณ์ที่ subscribe — fire-and-forget, ลบ sub ที่หมดอายุ (404/410) */
export async function sendToUser(userId, payload) {
  try {
    await ensureVapid();
    const subs = isPg()
      ? await q('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1', [userId])
      : getDb().prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?').all(userId);
    if (!subs.length) return;
    const data = JSON.stringify({
      title: String(payload.title || 'Demo Lottery').slice(0, 120),
      body: String(payload.body || '').slice(0, 300),
      link: payload.link || '/',
    });
    const touch = (id) => isPg()
      ? qRun(`UPDATE push_subscriptions SET last_seen_at = to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') WHERE id = $1`, [id])
      : getDb().prepare(`UPDATE push_subscriptions SET last_seen_at = datetime('now') WHERE id = ?`).run(id);
    const del = (id) => isPg()
      ? qRun('DELETE FROM push_subscriptions WHERE id = $1', [id])
      : getDb().prepare('DELETE FROM push_subscriptions WHERE id = ?').run(id);
    await Promise.allSettled(subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, data);
        await touch(s.id);
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) await del(s.id);
      }
    }));
  } catch (e) {
    console.error('[push] send failed:', e.message);
  }
}
