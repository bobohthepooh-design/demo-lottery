import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// .env อยู่ที่ repo root (demo-lottery/.env) — src อยู่ server/src → ขึ้น 2 ระดับ
const rootDir = path.resolve(__dirname, '..', '..');
const envPath = path.join(rootDir, '.env');

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  sessionSecret: process.env.SESSION_SECRET || 'dev-insecure-secret-change-me',
  sessionTtlHours: parseInt(process.env.SESSION_TTL_HOURS || '12', 10),
  // PostgreSQL — runtime บังคับใช้ PG เท่านั้น (SQLite support ถูกลบออกแล้ว)
  databaseUrl: process.env.DATABASE_URL || null,
  initialCredit: parseInt(process.env.INITIAL_CREDIT || '5000', 10),
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '300', 10),
  loginRateLimitMax: parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '10', 10),
  adminMfaRequired: process.env.ADMIN_MFA_REQUIRED !== 'false',
  line: {
    channelId: process.env.LINE_CHANNEL_ID || '',
    channelSecret: process.env.LINE_CHANNEL_SECRET || '',
    callbackUrl: process.env.LINE_CALLBACK_URL || '',
  },
  isProd: (process.env.NODE_ENV || 'development') === 'production',
  // TRUST_PROXY: ตั้ง 'true' เฉพาะเมื่อรันหลัง reverse proxy (nginx/caddy)
  // ถ้า expose node ตรงๆ ต้องเป็น false ไม่งั้น client spoof X-Forwarded-For
  // หลอก rate-limit/audit log ได้
  trustProxy: process.env.TRUST_PROXY
    ? (process.env.TRUST_PROXY === 'true' ? 1 : process.env.TRUST_PROXY === 'false' ? false : parseInt(process.env.TRUST_PROXY, 10) || 1)
    : ((process.env.NODE_ENV || 'development') === 'production' ? false : 1),
  // OTP_DEV_ECHO: ส่งรหัส OTP กลับใน API response (demo only — ห้ามเปิดบน internet
  // เพราะใครก็ login เป็นเบอร์ไหนก็ได้) default: เปิดเฉพาะ dev
  // env OTP_DEV_ECHO=true มีผลทั้ง production — ความปลอดภัยจริงอยู่ที่ canEchoOtp()
  // ที่เช็ค PRIVATE_IP ของ client IP (trust proxy) อีกชั้น: IP สาธารณะจะไม่ได้รหัสเสมอ
  otpDevEcho: process.env.OTP_DEV_ECHO !== undefined
    ? process.env.OTP_DEV_ECHO === 'true'
    : (process.env.NODE_ENV || 'development') !== 'production',
};

if (config.isProd && config.sessionSecret === 'dev-insecure-secret-change-me') {
  throw new Error('SESSION_SECRET must be set in production');
}
