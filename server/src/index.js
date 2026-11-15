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
import * as scratchService from './services/scratchService.js';
import * as hiloService from './services/hiloService.js';
import * as kiwiService from './services/kiwiService.js';
import kiwiRoutes from './routes/kiwi.js';
import { logger } from './lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await migrate();
// seed only if users table empty
if ((await getDb().prepare('SELECT COUNT(*) c FROM users').get()).c === 0) await seed();

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
    Promise.resolve(maybeDailyCashback()).catch(e => console.error('[cashback] failed:', e.message));
  }, 60 * 1000).unref();

  // ล้าง session/OTP ที่หมดอายุทิ้งทุก 6 ชม. — กัน DB บวมเมื่อเปิด public
  const cleanup = async () => {
    try {
      const d = getDb();
      const s = await d.prepare(`DELETE FROM user_sessions WHERE expires_at < datetime('now', '-1 day') OR revoked_at < datetime('now', '-7 days')`).run();
      const o = await d.prepare(`DELETE FROM otp_codes WHERE expires_at < datetime('now', '-1 day') OR (used = 1 AND created_at < datetime('now', '-1 day'))`).run();
      if (s.changes || o.changes) console.log(`[cleanup] sessions -${s.changes}, otp -${o.changes}`);
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
  contentSecurityPolicy: config.isProd ? undefined : false,
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: '256kb' }));

const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  // SSE connection เป็น long-lived — ไม่นับ rate limit (กัน client ค้าง/โดน 429)
  skip: (req) => req.path === '/events' || req.originalUrl === '/api/events',
  message: { error: 'คำขอมากเกินไป กรุณาลองใหม่ภายหลัง' },
});
app.use('/api/', limiter);

// ensure csrf cookie on any api response (before protection so cookie exists)
app.use('/api/', (req, res, next) => { ensureCsrf(req, res); next(); });
app.get('/api/csrf-token', csrfTokenEndpoint);
app.use('/api/', csrfProtection);

// health check — /api/health ตอบเร็วเสมอ (uptime monitor ใช้ตัวนี้)
// /api/health?deep=1 เช็ค DB ด้วย (ใช้ตรวจหลัง deploy/ก่อนเปิด traffic จริง)
app.get('/api/health', async (req, res) => {
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

// SSE — client subscribe รับแจ้งเตือน real-time เมื่อข้อมูลเปลี่ยน (ผลรางวัล/รอบ/การตั้งค่า)
app.get('/api/events', sseHandler);

app.use('/api/auth', authRoutes);
app.use('/api/lottery', lotteryRoutes);
app.use('/api/bets', betRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/scratch', scratchRoutes);
app.use('/api/hilo', hiloRoutes);
app.use('/api/kiwi', kiwiRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/chat', chatMemberRoutes);
app.use('/api/admin/chat', chatAdminRoutes); // ต้องก่อน /api/admin (admin.js มี requirePerm dashboard.admin)
app.use('/api/admin', adminRoutes);

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
