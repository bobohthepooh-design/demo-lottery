// uptime-watchdog.mjs — เฝ้า /api/health?deep=1 ทุก 60 วิ
// ล้ม 2 รอบติด → แจ้ง Telegram (ใช้ bot/chat_id เดียวกับระบบ) • ฟื้น → แจ้ง "กลับมาแล้ว"
// รันค้างไว้: node scripts/uptime-watchdog.mjs  (หรือผ่าน watchdog.bat ใน Startup)
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_FILE = path.join(ROOT, '.watchdog-state.json');
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const LAN_IP = (env.match(/LAN_IP=(.+)/) || [])[1]?.trim() || 'localhost';
const BASE = `http://${LAN_IP}`;
const INTERVAL_MS = 60_000;
const FAIL_THRESHOLD = 2;

const log = (...a) => console.log(`[watchdog ${new Date().toISOString()}]`, ...a);

function telegramCreds() {
  try {
    const out = execSync(
      `docker exec demo-lottery-postgres-1 psql -U lottery -d lottery -t -A -c "SELECT key||'='||value FROM system_settings WHERE key IN ('telegram_bot_token','telegram_chat_id')"`,
      { encoding: 'utf8' }
    );
    const m = Object.fromEntries(out.trim().split('\n').filter(Boolean).map(l => l.split('=')));
    return m.telegram_bot_token && m.telegram_chat_id ? m : null;
  } catch { return null; }
}

async function sendTelegram(text) {
  const c = telegramCreds();
  if (!c) { log('ไม่มี Telegram creds — ข้ามการแจ้งเตือน'); return false; }
  try {
    const r = await fetch(`https://api.telegram.org/bot${c.telegram_bot_token}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: c.telegram_chat_id, text, disable_web_page_preview: true }),
    });
    return r.ok;
  } catch (e) { log('telegram send failed:', e.message); return false; }
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { fails: 0, alerted: false }; }
}
function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s)); }

let state = loadState();

async function tick() {
  let ok = false, detail = '';
  try {
    const r = await fetch(`${BASE}/api/health?deep=1`, { signal: AbortSignal.timeout(15000) });
    const j = await r.json().catch(() => ({}));
    ok = r.ok && j.ok === true && (!j.db || j.db === 'ok');
    detail = `HTTP ${r.status} db=${j.db || '-'}`;
  } catch (e) { detail = `EXC ${e.message}`; }

  if (ok) {
    if (state.alerted) {
      const sent = await sendTelegram(`✅ <b>เว็บกลับมาทำงานแล้ว</b>\n${BASE} — /api/health?deep=1 ตอบปกติ`);
      log(`RECOVERED (telegram ${sent ? 'sent' : 'failed'})`);
    }
    state = { fails: 0, alerted: false };
  } else {
    state.fails += 1;
    log(`FAIL #${state.fails} — ${detail}`);
    if (state.fails >= FAIL_THRESHOLD && !state.alerted) {
      const sent = await sendTelegram(
        `🚨 <b>เว็บล่ม!?</b>\n${BASE} — /api/health?deep=1 ไม่ตอบสนอง ${state.fails} ครั้งติด\nล่าสุด: ${detail}\nเวลา: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`
      );
      state.alerted = true;
      log(`ALERT sent=${sent}`);
    }
  }
  saveState(state);
}

log(`start — watch ${BASE}/api/health?deep=1 every ${INTERVAL_MS / 1000}s (alert after ${FAIL_THRESHOLD} fails)`);
tick();
setInterval(tick, INTERVAL_MS); // ห้าม unref — ต้องค้างไว้เฝ้าตลอด
