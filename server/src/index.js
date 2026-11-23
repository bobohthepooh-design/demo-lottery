import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { seed } from './db/seed.js';
import { seedDemoDraws } from './db/demo-data.js';
import { getDb } from './db/index.js';
import { getPool } from './db/pg.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { csrfTokenEndpoint, csrfProtection, ensureCsrf } from './middleware/csrf.js';
import authRoutes from './routes/auth.js';
import lotteryRoutes from './routes/lottery.js';
import betRoutes from './routes/bets.js';
import notificationRoutes from './routes/notifications.js';
import adminRoutes from './routes/admin.js';
import { autoSettleResults } from './services/resultFetcher.js';
import { memberRouter as chatMemberRoutes, adminRouter as chatAdminRoutes } from './routes/chat.js';
import { sseHandler } from './services/events.js';
import scratchRoutes from './routes/scratch.js';
import hiloRoutes from './routes/hilo.js';
import pushRoutes from './routes/push.js';
import { maybeDailyCashback } from './services/promoService.js';
import { sendTelegram } from './services/telegramService.js';
import * as scratchService from './services/scratchService.js';
import * as hiloService from './services/hiloService.js';
import * as kiwiService from './services/kiwiService.js';
import kiwiRoutes from './routes/kiwi.js';
import publicRoutes from './routes/public.js';
import paymentRoutes from './routes/payments.js';
import complianceRoutes from './routes/compliance.js';
import { logger } from './lib/logger.js';
import { openApiSpec } from './lib/openapi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await migrate();
// seed only if users table empty — advisory lock กันหลาย worker seed ซ้ำกัน
// (test files รันขนานบน DB เดียวกัน: ทั้งคู่เห็น users=0 แล้ว INSERT admin ชนกัน)
{
  const client = await getPool().connect();
  try {
    await client.query('SELECT pg_advisory_lock(727002)');
    const c = await client.query('SELECT COUNT(*)::int c FROM users');
    if (c.rows[0].c === 0) await seed();
  } finally {
    try { await client.query('SELECT pg_advisory_unlock(727002)'); } catch {}
    client.release();
  }
}

// instant games (หวยขูด/ไฮโล) — สร้าง lottery type/rule/standing draw ตอน boot
// เพื่อให้ type โผล่ใน /lottery/types และเมนูทันที ไม่ต้องรอการซื้อครั้งแรก
try { await scratchService.ensureInfra(); await hiloService.ensureInfra(); await kiwiService.ensureInfra(); }
catch (e) { console.error('[instant-games] infra init failed:', e.message); }

// สร้างรอบหวยตัวอย่างอัตโนมัติ (idempotent — เติมเฉพาะรอบที่ยังไม่มี)
// หวยไทย: ทุกวันที่ 1 และ 16 ของเดือน | ประเทศอื่น: top-up ให้มีรอบล่วงหน้าเสมอ
if (config.env !== 'test') {
  const tickSeed = () => Promise.resolve(seedDemoDraws()).catch(e => console.error('[demo-data] tick seed failed:', e.message));
  try { await tickSeed(); } catch (e) { console.error('[demo-data] auto-seed failed:', e.message); }
  // ดึงผลรางวัลอัตโนมัติทุก 1 นาที — พร้อม top-up รอบหวย (ราศีต้องมีรอบเปิดรับเดียวหมุนต่อเนื่อง)
  // แจ้งเตือน Telegram เมื่อมีรอบหวยค้างผล >2 ชม. — กันแอดมินไม่รู้ตัว
  let lastOverdueAlert = 0;
  const checkOverdue = async () => {
    try {
      const d = getDb();
      // draw_at เก็บเป็น UTC 'YYYY-MM-DD HH:MM:SS' — เทียบ string ตรงๆ (Postgres ไม่มี datetime())
      const cutoff = new Date(Date.now() - 2 * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
      const rows = await d.prepare(`SELECT d.draw_code, d.draw_at, lt.name_th AS type_name, lt.code AS type_code, lt.result_mode, c.code AS cat_code, c.name_th AS cat_name
        FROM lottery_draws d JOIN lottery_types lt ON lt.id = d.lottery_type_id
        LEFT JOIN lottery_categories c ON c.id = d.category_id
        WHERE d.status IN ('open','scheduled','closed')
          AND d.draw_at <= ?
          AND lt.code NOT IN ('SC','HL','KI','CF')
          AND d.id NOT IN (SELECT draw_id FROM lottery_results)
        ORDER BY d.draw_at LIMIT 10`).all(cutoff)
        .then(rs => rs.filter(r => r.result_mode !== 'manual' && !(r.type_code === 'HN' && r.cat_code === 'HNS')));
      if (!rows.length) return;
      const now = Date.now();
      if (now - lastOverdueAlert < 30 * 60 * 1000) return;
      lastOverdueAlert = now;
      const list = rows.map(r => `• ${r.draw_code} (${r.cat_name || r.type_name}) ออก ${r.draw_at}`).join('\n');
      await sendTelegram(`🚨 หวยค้างผลเกิน 2 ชม. — ${rows.length} รอบ\n${list}\n\nตรวจสอบ: /admin/health`);
      logger.warn('overdue-alert', rows.map(r => r.draw_code).join(', '));
    } catch (e) { console.error('[overdue-alert] failed:', e.message); }
  };
  const autoSettle = () => autoSettleResults()
    .then(r => {
      if (r.settled.length) logger.info('auto-settle', `settled: ${r.settled.join(', ')}`);
      if (r.errors.length) logger.warn('auto-settle', `errors: ${r.errors.join(' | ')}`, { sources: r.sources });
    })
    .catch(e => logger.error('auto-settle', e.message));
  setTimeout(() => { tickSeed(); autoSettle(); }, 20000).unref();
  setInterval(() => {
    tickSeed();
    autoSettle();
    checkOverdue();
    Promise.resolve(maybeDailyCashback()).catch(e => console.error('[cashback] failed:', e.message));
  }, 60 * 1000).unref();

  // ล้าง session/OTP ที่หมดอายุทิ้งทุก 6 ชม. — กัน DB บวมเมื่อเปิด public
  const cleanup = async () => {
    try {
      const d = getDb();
      const cutoff1 = `to_char((now() AT TIME ZONE 'UTC') - interval '1 day','YYYY-MM-DD HH24:MI:SS')`;
      const cutoff7 = `to_char((now() AT TIME ZONE 'UTC') - interval '7 days','YYYY-MM-DD HH24:MI:SS')`;
      const s = await d.prepare(`DELETE FROM user_sessions WHERE expires_at < ${cutoff1} OR revoked_at < ${cutoff7}`).run();
      const o = await d.prepare(`DELETE FROM otp_codes WHERE expires_at < ${cutoff1} OR (used = 1 AND created_at < ${cutoff1})`).run();
      // retention: reset/verify tokens หมดอายุ/ใช้แล้วเก็บ 1 วัน; email_verifications เหมือนกัน
      const pr = await d.prepare(`DELETE FROM password_reset_tokens WHERE expires_at < ${cutoff1} OR (used_at IS NOT NULL AND used_at < ${cutoff1})`).run();
      const ev = await d.prepare(`DELETE FROM email_verifications WHERE expires_at < ${cutoff1} OR (used_at IS NOT NULL AND used_at < ${cutoff1})`).run();
      // data retention — notifications: อ่านแล้วเก็บ 30 วัน, ไม่อ่านเก็บ 180 วัน
      // (audit_logs/transactions/slips เก็บถาวร — เป็น ledger/audit trail ตามกฎหมาย)
      const cutoff30 = `to_char((now() AT TIME ZONE 'UTC') - interval '30 days','YYYY-MM-DD HH:MM:SS')`;
      const cutoff180 = `to_char((now() AT TIME ZONE 'UTC') - interval '180 days','YYYY-MM-DD HH:MM:SS')`;
      const n = await d.prepare(`DELETE FROM notifications WHERE (read_at IS NOT NULL AND read_at < ${cutoff30}) OR created_at < ${cutoff180}`).run();
      if (s.changes || o.changes || n.changes || pr.changes || ev.changes)
        console.log(`[cleanup] sessions -${s.changes}, otp -${o.changes}, reset_tokens -${pr.changes}, email_verify -${ev.changes}, notifications -${n.changes}`);
    } catch (e) { console.error('[cleanup] failed:', e.message); }
  };
  setTimeout(cleanup, 60000).unref();
  setInterval(cleanup, 6 * 3600 * 1000).unref();
}

const app = express();
app.disable('x-powered-by');
// trust proxy ตั้งค่าผ่าน TRUST_PROXY env — false เมื่อ expose node ตรง (กัน XFF spoofing)
app.set('trust proxy', config.trustProxy);

app.use(helmet({
  contentSecurityPolicy: config.isProd ? {
    useDefaults: true,
    directives: {
      // เอา upgrade-insecure-requests ออก — server เสิร์ฟ http://<LAN-IP> ด้วย
      // ถ้าบังคับ upgrade → fetch('/api/...') ถูก upgrade เป็น https ที่ cert ไม่ valid → API ล่มทั้งระบบบน LAN
      upgradeInsecureRequests: null,
    },
  } : false,
  crossOriginEmbedderPolicy: false,
}));
app.use('/api/payments', express.json({ limit: '6mb' }));
app.use(express.json({ limit: '256kb' }));

const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  // SSE connection เป็น long-lived — ไม่นับ rate limit (กัน client ค้าง/โดน 429)
  // /health ก็ไม่นับ — uptime monitor/healthcheck ยิงบ่อย ไม่ควรกินโควตา user
  // รองรับทั้ง /api/events และ /api/v1/events
  skip: (req) => /\/events$/.test(req.path) || /\/events$/.test(req.originalUrl) || /\/health$/.test(req.path),
  message: { error: 'คำขอมากเกินไป กรุณาลองใหม่ภายหลัง' },
});
app.use('/api/', limiter);

// ensure csrf cookie on any api response (before protection so cookie exists)
app.use('/api/', (req, res, next) => { ensureCsrf(req, res); next(); });
app.get(['/api/csrf-token', '/api/v1/csrf-token'], csrfTokenEndpoint);
app.use('/api/', csrfProtection);

// health check — /api/health ตอบเร็วเสมอ (uptime monitor ใช้ตัวนี้)
// /api/health?deep=1 เช็ค DB ด้วย (ใช้ตรวจหลัง deploy/ก่อนเปิด traffic จริง)
app.get(['/api/health', '/api/v1/health'], async (req, res) => {
  const out = { ok: true, service: 'demo-lottery', env: config.env, features: { lineLogin: !!config.line.channelId } };
  if (req.query.deep === '1') {
    try {
      await getDb().prepare('SELECT 1').get();
      out.db = 'ok';
    } catch (e) {
      out.ok = false; out.db = 'error';
      logger.error('health', `deep check failed: ${e.message}`);
    }
  }
  res.status(out.ok ? 200 : 503).json(out);
});

// API v1 — router ชุดเดียวกัน mount ซ้ำใต้ /api/v1 (backward compat: /api เดิมยังใช้ได้)
// ลำดับต้องเหมือนกัน — /admin/chat ต้องก่อน /admin
const apiRouters = [
  ['/auth', authRoutes],
  ['/lottery', lotteryRoutes],
  ['/bets', betRoutes],
  ['/payments', paymentRoutes],
  ['/compliance', complianceRoutes],
  ['/notifications', notificationRoutes],
  ['/scratch', scratchRoutes],
  ['/hilo', hiloRoutes],
  ['/kiwi', kiwiRoutes],
  ['/push', pushRoutes],
  ['/chat', chatMemberRoutes],
  ['/admin/chat', chatAdminRoutes],
  ['/admin', adminRoutes],
  ['/public', publicRoutes],
];
for (const [prefix, router] of apiRouters) {
  app.use(`/api${prefix}`, router);
  app.use(`/api/v1${prefix}`, router);
}

// OpenAPI spec — /api/openapi.json และ /api/v1/openapi.json
app.get(['/api/openapi.json', '/api/v1/openapi.json'], (req, res) => {
  res.json(openApiSpec);
});

// SSE — client subscribe รับแจ้งเตือน real-time เมื่อข้อมูลเปลี่ยน (ผลรางวัล/รอบ/การตั้งค่า)
// รองรับทั้ง /api/events และ /api/v1/events
app.get(['/api/events', '/api/v1/events'], sseHandler);

app.use('/api/', notFound);

// serve built client in production
const clientDist = path.resolve(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  // HTML ต้อง revalidate ทุกครั้ง — กัน browser เสิร์ฟ index.html เก่าที่ชี้ไป bundle เก่า (asset มี hash อยู่แล้ว cache ได้นาน)
  app.use((req, res, next) => {
    if (req.path === '/' || req.path.endsWith('.html')) res.set('Cache-Control', 'no-cache');
    next();
  });
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(errorHandler);

export default app;

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const server = app.listen(config.port, () => {
    console.log(`[demo-lottery] server listening on http://localhost:${config.port} (${config.env})`);
  });
  // graceful shutdown — รอ request ค้างเสร็จก่อนปิด (กัน restart แล้ว request ขาดกลางคัน)
  let shuttingDown = false;
  const shutdown = (sig) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[demo-lottery] ${sig} received — draining connections`);
    server.close(() => { console.log('[demo-lottery] server closed'); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref(); // force exit ถ้าค้างเกิน 10 วิ
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  // กัน process ดับเงียบ — log ไว้ใน app.log ให้ตามตรวจย้อนหลังได้
  process.on('unhandledRejection', (e) => logger.error('process', `unhandledRejection: ${e?.message || e}`, { stack: String(e?.stack || '').slice(0, 1500) }));
  process.on('uncaughtException', (e) => {
    logger.error('process', `uncaughtException: ${e?.message || e}`, { stack: String(e?.stack || '').slice(0, 1500) });
    setTimeout(() => process.exit(1), 500).unref();
  });
}
