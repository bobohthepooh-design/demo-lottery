import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { requireAuth, requireMfaVerified } from '../services/authService.js';
import { requirePerm } from '../middleware/rbac.js';
import { HttpError } from '../lib/audit.js';
import { broadcast } from '../services/events.js';

// แชทส่วนตัว สมาชิก ↔ แอดมิน — 1 thread ต่อสมาชิก (thread สร้าง lazy ตอนส่ง/เปิดครั้งแรก)

const db = () => getDb();
const BODY_MAX = 500;

const msgSchema = z.object({ body: z.string().trim().min(1).max(BODY_MAX) });

async function threadForUser(userId) {
  let t = await db().prepare('SELECT * FROM chat_threads WHERE user_id = ?').get(userId);
  if (!t) {
    await db().prepare('INSERT INTO chat_threads (user_id) VALUES (?)').run(userId);
    t = await db().prepare('SELECT * FROM chat_threads WHERE user_id = ?').get(userId);
  }
  return t;
}

function msgDto(m, viewerId) {
  return {
    id: m.id, body: m.body, isAdmin: !!m.is_admin,
    senderId: m.sender_id,
    sender: m.sender_name || (m.is_admin ? 'แอดมิน' : ''),
    createdAt: m.created_at,
    mine: m.sender_id === viewerId,
  };
}

const MSG_SELECT = `SELECT m.*, u.username AS sender_name
  FROM chat_messages m JOIN users u ON u.id = m.sender_id`;

// ---------- member routes: /api/chat ----------
export const memberRouter = Router();
memberRouter.use(requireAuth);

// thread ของฉัน + ข้อความล่าสุด (สร้าง thread ถ้ายังไม่มี)
memberRouter.get('/thread', async (req, res) => {
  const t = await threadForUser(req.user.id);
  const limit = Math.min(parseInt(req.query.limit || '100', 10), 200);
  const msgs = (await db().prepare(`${MSG_SELECT} WHERE m.thread_id = ? ORDER BY m.id DESC LIMIT ?`)
    .all(t.id, limit)).reverse();
  // mark อ่านแล้วฝั่ง member
  await db().prepare('UPDATE chat_messages SET read_by_user = 1 WHERE thread_id = ? AND is_admin = 1 AND read_by_user = 0').run(t.id);
  res.json({ threadId: t.id, messages: msgs.map(m => msgDto(m, req.user.id)) });
});

// จำนวนข้อความแอดมินที่ยังไม่อ่าน — ใช้ทำ badge บนปุ่มแชท (ไม่ mark read)
memberRouter.get('/unread', async (req, res) => {
  const t = await db().prepare('SELECT id FROM chat_threads WHERE user_id = ?').get(req.user.id);
  const unread = t ? (await db().prepare('SELECT COUNT(*) c FROM chat_messages WHERE thread_id = ? AND is_admin = 1 AND read_by_user = 0').get(t.id)).c : 0;
  res.json({ unread });
});

memberRouter.post('/messages', async (req, res, next) => {
  try {
    const { body } = msgSchema.parse(req.body);
    const t = await threadForUser(req.user.id);
    const r = await db().prepare('INSERT INTO chat_messages (thread_id, sender_id, is_admin, body) VALUES (?, ?, 0, ?)')
      .run(t.id, req.user.id, body);
    await db().prepare(`UPDATE chat_threads SET last_msg_at = datetime('now') WHERE id = ?`).run(t.id);
    broadcast('chat', { to: 'admin' });
    res.status(201).json({ ok: true, id: Number(r.lastInsertRowid) });
  } catch (e) { next(e); }
});

// ---------- admin routes: /api/admin/chat ----------
export const adminRouter = Router();
adminRouter.use(requireAuth, requireMfaVerified, requirePerm('members.manage'));

// จำนวนข้อความที่ยังไม่อ่านรวม — ใช้ทำ badge บนเมนูแชทใน admin
adminRouter.get('/unread', async (req, res) => {
  const row = await db().prepare('SELECT COUNT(*) c FROM chat_messages WHERE is_admin = 0 AND read_by_admin = 0').get();
  res.json({ unread: row.c });
});

// รายการ thread ทั้งหมด — ล่าสุดก่อน + จำนวนข้อความที่ admin ยังไม่อ่าน
adminRouter.get('/threads', async (req, res) => {
  const rows = await db().prepare(`
    SELECT t.id AS thread_id, t.user_id, t.last_msg_at,
           u.username, u.display_name, u.status,
           (SELECT COUNT(*) FROM chat_messages m WHERE m.thread_id = t.id AND m.is_admin = 0 AND m.read_by_admin = 0) AS unread,
           (SELECT body FROM chat_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_body,
           (SELECT is_admin FROM chat_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_is_admin
    FROM chat_threads t JOIN users u ON u.id = t.user_id
    ORDER BY COALESCE(t.last_msg_at, t.created_at) DESC LIMIT 200`).all();
  res.json({ threads: rows.map(r => ({
    threadId: r.thread_id, userId: r.user_id,
    username: r.username, displayName: r.display_name, status: r.status,
    unread: r.unread, lastBody: r.last_body, lastIsAdmin: !!r.last_is_admin,
    lastMsgAt: r.last_msg_at,
  })) });
});

adminRouter.get('/threads/:userId/messages', async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId <= 0) throw new HttpError(400, 'userId ไม่ถูกต้อง');
  const t = await db().prepare('SELECT * FROM chat_threads WHERE user_id = ?').get(userId);
  if (!t) return res.json({ messages: [], threadId: null });
  const limit = Math.min(parseInt(req.query.limit || '200', 10), 500);
  const msgs = (await db().prepare(`${MSG_SELECT} WHERE m.thread_id = ? ORDER BY m.id DESC LIMIT ?`)
    .all(t.id, limit)).reverse();
  await db().prepare('UPDATE chat_messages SET read_by_admin = 1 WHERE thread_id = ? AND is_admin = 0 AND read_by_admin = 0').run(t.id);
  res.json({ threadId: t.id, messages: msgs.map(m => msgDto(m, req.user.id)) });
});

adminRouter.post('/threads/:userId/messages', async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) throw new HttpError(400, 'userId ไม่ถูกต้อง');
    const { body } = msgSchema.parse(req.body);
    const target = await db().prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!target) throw new HttpError(404, 'ไม่พบสมาชิก');
    const t = await threadForUser(userId);
    const r = await db().prepare('INSERT INTO chat_messages (thread_id, sender_id, is_admin, body) VALUES (?, ?, 1, ?)')
      .run(t.id, req.user.id, body);
    await db().prepare(`UPDATE chat_threads SET last_msg_at = datetime('now') WHERE id = ?`).run(t.id);
    broadcast('chat', { to: String(userId) });
    res.status(201).json({ ok: true, id: Number(r.lastInsertRowid) });
  } catch (e) { next(e); }
});
