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
import os from 'node:os';
const LAN_IP = (env.match(/LAN_IP=(.+)/) || [])[1]?.trim() || 'localhost';
// auto-detect IP ปัจจุบันทุก tick — รองรับ DHCP เปลี่ยน IP เอง (เช่น 192.168.31.251 → .252)
// ลำดับ: NIC ที่มี IPv4 ในวง 192.168/10.x/172.16-31 จริง → .env LAN_IP → localhost
function detectBase() {
  try {
    const addrs = [];
    for (const infos of Object.values(os.networkInterfaces())) {
      for (const i of infos || []) {
        if (i.family === 'IPv4' && !i.internal) addrs.push(i.address);
      }
    }
    // เลือก LAN จริง — 192.168 ก่อน (กัน Docker 172.17/WSL 172.29 หลอก)
    const pick = addrs.find(a => a.startsWith('192.168.'))
      || addrs.find(a => a.startsWith('10.'))
      || addrs.find(a => /^172\.(1[6-9]|2\d|3[01])\./.test(a));
    if (pick) return `http://${pick}`;
  } catch {}
  return `http://${LAN_IP === 'localhost' ? 'localhost' : LAN_IP}`;
}
let BASE = detectBase();
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

// ---------- ops checks (ทุก 1 ชม.) — backup freshness + disk space ----------
const OPS_INTERVAL_MS = 60 * 60 * 1000;
let lastOpsCheck = 0;
const opsState = { backupBad: false, diskBad: false };

function newestBackupAge() {
  try {
    const dir = path.join(ROOT, 'backups');
    const files = fs.readdirSync(dir).filter(f => f.startsWith('lottery-') && f.endsWith('.dump'));
    if (!files.length) return Infinity;
    const newest = Math.max(...files.map(f => fs.statSync(path.join(dir, f)).mtimeMs));
    return Date.now() - newest;
  } catch { return Infinity; }
}

function diskFreeBytes() {
  try {
    const out = execSync('powershell -NoProfile -Command "(Get-PSDrive C).Free"', { encoding: 'utf8' }).trim();
    return Number(out);
  } catch { return null; }
}

async function checkOps() {
  const newlyBad = [];
  const recovered = [];
  const flag = (key, bad, msg, okMsg) => {
    if (bad && !opsState[key]) { opsState[key] = true; newlyBad.push(msg); }
    else if (!bad && opsState[key]) { opsState[key] = false; recovered.push(okMsg); }
  };
  // backup ต้องไม่เก่ากว่า 26 ชม. (task รัน 03:00 ทุกวัน)
  const ageH = newestBackupAge() / 3600e3;
  flag('backupBad', ageH > 26,
    `🗄️ backup เก่าเกิน 26 ชม. (ล่าสุด ${Number.isFinite(ageH) ? ageH.toFixed(0) + ' ชม.' : 'ไม่มีไฟล์'})`,
    'backup กลับมาปกติ');
  // disk ว่างต้อง > 2GB
  const free = diskFreeBytes();
  flag('diskBad', free !== null && free < 2 * 1024 ** 3,
    `💾 disk C: เหลือ ${free !== null ? (free / 1024 ** 3).toFixed(1) + ' GB (<2GB)' : '?'}`,
    'disk กลับมาปกติ');
  if (newlyBad.length)
    await sendTelegram(`⚠️ <b>Ops alert</b>\n${newlyBad.join('\n')}\nเวลา: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`);
  if (recovered.length) await sendTelegram(`✅ ${recovered.join(', ')}`);
  if (newlyBad.length || recovered.length) log('OPS', [...newlyBad, ...recovered].join(' | '));
}

async function tick() {
  BASE = detectBase(); // อัปเดต IP ล่าสุดทุกครั้ง
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
  if (Date.now() - lastOpsCheck > OPS_INTERVAL_MS) {
    lastOpsCheck = Date.now();
    await checkOps().catch(e => log('ops-check failed:', e.message));
  }
}

log(`start — watch ${BASE}/api/health?deep=1 every ${INTERVAL_MS / 1000}s (alert after ${FAIL_THRESHOLD} fails)`);
tick();
setInterval(tick, INTERVAL_MS); // ห้าม unref — ต้องค้างไว้เฝ้าตลอด
