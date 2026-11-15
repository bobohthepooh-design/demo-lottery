import { Router } from 'express';
import { z } from 'zod';
import * as notify from '../services/notifyService.js';
import { requireAuth } from '../services/authService.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  res.json({
    notifications: await notify.listForUser(req.user.id),
    unread: await notify.unreadCount(req.user.id),
  });
});

const readSchema = z.object({ ids: z.array(z.number().int().positive()).max(100).optional() });
router.post('/read', async (req, res) => {
  const { ids } = readSchema.parse(req.body || {});
  res.json({ ok: true, marked: await notify.markRead(req.user.id, ids) });
});

export default router;
