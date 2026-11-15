import webpush from 'web-push';
import { getDb } from '../db/index.js';
import { getSetting, setSetting } from './settingsService.js';

let vapidReady = false;

// VAPID keys — สร้างครั้งเดียวเก็บใน system_settings (demo — ถ้า production ควรใส่ผ่าน env)
function ensureVapid() {
  if (vapidReady) return;
  let pub = getSetting('vapid_public_key');
  let priv = getSetting('vapid_private_key');
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    pub = k.publicKey; priv = k.privateKey;
    setSetting('vapid_public_key', pub, null);
    setSetting('vapid_private_key', priv, null);
  }
  webpush.setVapidDetails('mailto:demo-lottery@localhost', pub, priv);
  vapidReady = true;
}

export function vapidPublicKey() {
  ensureVapid();
  return getSetting('vapid_public_key');
}

export function saveSubscription(userId, sub) {
  const endpoint = String(sub?.endpoint || '');
  const p256dh = String(sub?.keys?.p256dh || '');
  const auth = String(sub?.keys?.auth || '');
  if (!endpoint.startsWith('https://') || !p256dh || !auth) return false;
  getDb().prepare(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id,
                     p256dh = excluded.p256dh, auth = excluded.auth, last_seen_at = datetime('now')`)
    .run(userId, endpoint.slice(0, 1000), p256dh, auth);
  return true;
}

export function removeSubscription(userId, endpoint) {
  getDb().prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?')
    .run(userId, String(endpoint || '').slice(0, 1000));
}

export function subscriptionCount(userId) {
  return getDb().prepare('SELECT COUNT(*) c FROM push_subscriptions WHERE user_id = ?').get(userId).c;
}

/** ส่ง push ให้สมาชิกทุกอุปกรณ์ที่ subscribe — fire-and-forget, ลบ sub ที่หมดอายุ (404/410) */
export async function sendToUser(userId, payload) {
  try {
    ensureVapid();
    const subs = getDb().prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?').all(userId);
    if (!subs.length) return;
    const data = JSON.stringify({
      title: String(payload.title || 'Demo Lottery').slice(0, 120),
      body: String(payload.body || '').slice(0, 300),
      link: payload.link || '/',
    });
    await Promise.allSettled(subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, data);
        getDb().prepare(`UPDATE push_subscriptions SET last_seen_at = datetime('now') WHERE id = ?`).run(s.id);
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {
          getDb().prepare('DELETE FROM push_subscriptions WHERE id = ?').run(s.id);
        }
      }
    }));
  } catch (e) {
    console.error('[push] send failed:', e.message);
  }
}
