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
  // key แยกสำหรับ encrypt secrets at rest (mfa_secret ฯลฯ) — fallback sessionSecret
  mfaEncryptionKey: process.env.MFA_ENCRYPTION_KEY || '',
  sessionTtlHours: parseInt(process.env.SESSION_TTL_HOURS || '12', 10),
  // PostgreSQL — runtime บังคับใช้ PG เท่านั้น (SQLite support ถูกลบออกแล้ว)
  databaseUrl: process.env.DATABASE_URL || null,
  initialCredit: parseInt(process.env.INITIAL_CREDIT || '5000', 10),
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '300', 10),
  loginRateLimitMax: parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '10', 10),
  adminMfaRequired: process.env.ADMIN_MFA_REQUIRED !== 'false',
  // Payment — PromptPay QR + SlipOK slip verification (เติม/ถอนเงินจริง)
  // PROMPTPAY_ID: เบอร์มือถือ 0xxxxxxxxx / เลขบัตร ปชช. 13 หลัก / e-Wallet 15 หลัก
  promptPayId: process.env.PROMPTPAY_ID || '',
  // SlipOK: https://slipok.com — branchId + apiKey (เว้นว่าง = ปิด auto-verify → admin approve เอง)
  slipokBranchId: process.env.SLIPOK_BRANCH_ID || '',
  slipokApiKey: process.env.SLIPOK_API_KEY || '',
  line: {
    channelId: process.env.LINE_CHANNEL_ID || '',
    channelSecret: process.env.LINE_CHANNEL_SECRET || '',
    callbackUrl: process.env.LINE_CALLBACK_URL || '',
    // Messaging API channel access token — สำหรับ push notification หาผู้ใช้ LINE
    // (ต้องเป็น channel เดียวกับ Login + ผู้ใช้ต้อง add OA เป็นเพื่อน ไม่งั้น push จะ 403)
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  },
  // URL สาธารณะของเว็บ — ใช้สร้าง absolute link ใน notification ภายนอก (LINE/email)
  publicUrl: process.env.PUBLIC_URL || '',
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
  // HIBP k-anonymity password breach check — fail-open ถ้า api.pwnedpasswords.com ล่ม
  // ปิดได้ด้วย HIBP_CHECK=false (เช่น LAN ที่ไม่มี outbound internet)
  hibpCheck: process.env.HIBP_CHECK !== 'false',
  // Security hardening (ฟรี): Turnstile bot protection + SMTP email + terms version
  // Turnstile: https://dash.cloudflare.com → Turnstile (ฟรีไม่จำกัด) — เว้นว่าง = ปิด
  turnstile: {
    siteKey: process.env.TURNSTILE_SITE_KEY || '',
    secretKey: process.env.TURNSTILE_SECRET_KEY || '',
  },
  // SMTP สำหรับส่ง email verify / OTP ทางอีเมล / password reset — ฟรี: Brevo/Resend/Gmail app password
  // เว้นว่าง SMTP_HOST = dev mode (เก็บ token ใน DB + devToken echo บน private IP เหมือน OTP)
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@demo.local',
  },
  termsVersion: process.env.TERMS_VERSION || '2026-01',
};

if (config.isProd && config.sessionSecret === 'dev-insecure-secret-change-me') {
  throw new Error('SESSION_SECRET must be set in production');
}
