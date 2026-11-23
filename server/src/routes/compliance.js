// Member-facing compliance — KYC request/status + support/dispute tickets
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../services/authService.js';
import { getDb } from '../db/index.js';
import { audit, HttpError } from '../lib/audit.js';
import { broadcast } from '../services/events.js';

const router = Router();
router.use(requireAuth);
const db = () => getDb();
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// ---------- KYC (manual) ----------

router.get('/kyc/status', async (req, res, next) => {
  try {
    const u = await db().prepare(`SELECT kyc_status, kyc_requested_at, kyc_reviewed_at, kyc_note FROM users WHERE id = ?`).get(req.user.id);
    res.json({ kyc: u || { kyc_status: 'none' } });
  } catch (e) { next(e); }
});

// member ขอ verify — จาก none/rejected เท่านั้น (pending แล้วรอ admin)
router.post('/kyc/request', async (req, res, next) => {
  try {
    const u = await db().prepare('SELECT kyc_status, email_verified FROM users WHERE id = ?').get(req.user.id);
    if (!u) throw new HttpError(404, 'ไม่พบผู้ใช้');
    if (u.kyc_status === 'pending') throw new HttpError(400, 'มีคำขอ KYC ที่รอตรวจสอบอยู่แล้ว', 'BAD_STATE');
    if (u.kyc_status === 'verified') throw new HttpError(400, 'บัญชีนี้ยืนยันตัวตนแล้ว', 'BAD_STATE');
    if (!u.email_verified) throw new HttpError(400, 'กรุณายืนยันอีเมลก่อนสมัคร KYC');
    await db().prepare(`UPDATE users SET kyc_status='pending', kyc_requested_at=?, kyc_note=NULL, updated_at=? WHERE id=?`)
      .run(now(), now(), req.user.id);
    audit({ userId: req.user.id, action: 'kyc.requested', entityType: 'user', entityId: String(req.user.id), req });
    broadcast('kyc');
    res.json({ ok: true, kycStatus: 'pending' });
  } catch (e) { next(e); }
});

// ---------- support / dispute tickets ----------

const ticketSchema = z.object({
  category: z.enum(['payment', 'bet', 'account', 'result', 'other', 'general']).default('general'),
  subject: z.string().min(3).max(150),
  message: z.string().min(10).max(3000),
});

router.get('/tickets', async (req, res, next) => {
  try {
    const rows = await db().prepare(`SELECT id, category, subject, message, status, admin_reply, created_at, updated_at, resolved_at
      FROM support_tickets WHERE user_id = ? ORDER BY id DESC LIMIT 50`).all(req.user.id);
    res.json({ tickets: rows });
  } catch (e) { next(e); }
});

router.post('/tickets', async (req, res, next) => {
  try {
    const data = ticketSchema.parse(req.body);
    // กันเปิด ticket รัวๆ — สูงสุด 5 ใบที่ยังไม่ปิด
    const open = await db().prepare(`SELECT COUNT(*) c FROM support_tickets WHERE user_id = ? AND status IN ('open','in_progress')`).get(req.user.id);
    if (open.c >= 5) throw new HttpError(400, 'มีเรื่องที่ยังไม่ปิดอยู่ 5 เรื่องแล้ว — รอแอดมินตอบก่อน', 'TOO_MANY_OPEN');
    const r = await db().prepare(`INSERT INTO support_tickets (user_id, category, subject, message) VALUES (?, ?, ?, ?)`)
      .run(req.user.id, data.category, data.subject, data.message);
    const id = r.lastInsertRowid;
    audit({ userId: req.user.id, action: 'ticket.created', entityType: 'support_ticket', entityId: String(id), detail: { category: data.category, subject: data.subject }, req });
    broadcast('tickets');
    res.json({ ok: true, id });
  } catch (e) { next(e); }
});

export default router;
