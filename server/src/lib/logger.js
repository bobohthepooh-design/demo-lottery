import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Minimal file logger — append JSON lines, rotate เมื่อเกิน MAX_BYTES
// ใช้เก็บ error/operator events ไว้ตรวจย้อนหลัง (audit_logs ใน DB เก็บเฉพาะ action สำคัญ)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = process.env.LOG_DIR || path.resolve(__dirname, '..', '..', 'data', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');
const MAX_BYTES = 5 * 1024 * 1024;

function rotate() {
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > MAX_BYTES) {
      fs.renameSync(LOG_FILE, LOG_FILE + '.1'); // เก็บแค่ 1 generation
    }
  } catch { /* ignore */ }
}

function write(level, scope, msg, extra = null) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    rotate();
    const line = JSON.stringify({
      ts: new Date().toISOString(), level, scope,
      msg: String(msg).slice(0, 500),
      ...(extra ? { extra } : {}),
    }) + '\n';
    fs.appendFileSync(LOG_FILE, line);
  } catch { /* logging ต้องไม่ทำให้ request พัง */ }
}

export const logger = {
  info: (scope, msg, extra) => { write('info', scope, msg, extra); console.log(`[${scope}]`, msg); },
  warn: (scope, msg, extra) => { write('warn', scope, msg, extra); console.warn(`[${scope}]`, msg); },
  error: (scope, msg, extra) => { write('error', scope, msg, extra); console.error(`[${scope}]`, msg); },
};
