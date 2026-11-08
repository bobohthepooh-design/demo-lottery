import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { runMigrations } from './db/migrate.js';
import { seed } from './db/seed.js';
import { getDb } from './db/index.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { csrfTokenEndpoint, csrfProtection, ensureCsrf } from './middleware/csrf.js';
import authRoutes from './routes/auth.js';
import lotteryRoutes from './routes/lottery.js';
import betRoutes from './routes/bets.js';
import adminRoutes from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

runMigrations();
// seed only if users table empty
if (getDb().prepare('SELECT COUNT(*) c FROM users').get().c === 0) seed();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

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
  message: { error: 'คำขอมากเกินไป กรุณาลองใหม่ภายหลัง' },
});
app.use('/api/', limiter);

// ensure csrf cookie on any api response (before protection so cookie exists)
app.use('/api/', (req, res, next) => { ensureCsrf(req, res); next(); });
app.get('/api/csrf-token', csrfTokenEndpoint);
app.use('/api/', csrfProtection);

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'demo-lottery', env: config.env, features: { lineLogin: !!config.line.channelId } }));

app.use('/api/auth', authRoutes);
app.use('/api/lottery', lotteryRoutes);
app.use('/api/bets', betRoutes);
app.use('/api/admin', adminRoutes);

app.use('/api/', notFound);

// serve built client in production
const clientDist = path.resolve(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use(errorHandler);

export default app;

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  app.listen(config.port, () => {
    console.log(`[demo-lottery] server listening on http://localhost:${config.port} (${config.env})`);
  });
}
