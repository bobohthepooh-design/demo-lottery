import { Router } from 'express';
import { requireAuth } from '../services/authService.js';
import * as push from '../services/pushService.js';
import { HttpError } from '../lib/audit.js';

const router = Router();

// public VAPID key สำหรับ subscribe (ไม่ใช่ secret)
router.get('/vapid-key', (req, res) => {
  res.json({ key: push.vapidPublicKey() });
});

router.post('/subscribe', requireAuth, (req, res, next) => {
  try {
    const ok = push.saveSubscription(req.user.id, req.body || {});
    if (!ok) throw new HttpError(400, 'subscription ไม่ถูกต้อง');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/unsubscribe', requireAuth, (req, res) => {
  push.removeSubscription(req.user.id, req.body?.endpoint);
  res.json({ ok: true });
});

router.get('/status', requireAuth, (req, res) => {
  res.json({ count: push.subscriptionCount(req.user.id) });
});

export default router;
