import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../services/authService.js';
import * as notify from '../services/notifyService.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json({
    notifications: notify.listForUser(req.user.id),
    unread: notify.unreadCount(req.user.id),
  });
});

const readSchema = z.object({ ids: z.array(z.number().int().positive()).max(100).optional() });
router.post('/read', (req, res) => {
  const { ids } = readSchema.parse(req.body || {});
  res.json({ ok: true, marked: notify.markRead(req.user.id, ids) });
});

export default router;
