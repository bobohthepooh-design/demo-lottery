import { Router } from 'express';
import { requireAuth } from '../services/authService.js';
import * as push from '../services/pushService.js';
import { HttpError } from '../lib/audit.js';

const router = Router();

// public VAPID key สำหรับ subscribe (ไม่ใช่ secret)
router.get('/vapid-key', async (req, res, next) => {
  try { res.json({ key: await push.vapidPublicKey() }); }
  catch (e) { next(e); }
});

router.post('/subscribe', requireAuth, async (req, res, next) => {
  try {
    const ok = await push.saveSubscription(req.user.id, req.body || {});
    if (!ok) throw new HttpError(400, 'subscription ไม่ถูกต้อง');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/unsubscribe', requireAuth, async (req, res, next) => {
  try {
    await push.removeSubscription(req.user.id, req.body?.endpoint);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/status', requireAuth, async (req, res, next) => {
  try { res.json({ count: await push.subscriptionCount(req.user.id) }); }
  catch (e) { next(e); }
});

export default router;
