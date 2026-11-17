// e2e/playwright-smoke.mjs — UI smoke test ด้วย Chrome จริง (channel:'chrome' ไม่ต้องโหลด browser)
// ครอบ: register UI → เกมด่วน scratch/hilo → wallet deposit → place bet → admin health + lotteries edit modal
// ใช้: node e2e/playwright-smoke.mjs   (ต้องมี Chrome ติดตั้ง + server รันอยู่)
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const BASE = `http://${(env.match(/LAN_IP=(.+)/) || [])[1]?.trim() || 'localhost'}`;
const SHOTS = path.join(ROOT, 'e2e', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

// ---- TOTP (admin MFA) ----
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32d(s) { let b = ''; for (const c of s.toUpperCase().replace(/=+$/, '')) b += B32.indexOf(c).toString(2).padStart(5, '0'); const o = []; for (let i = 0; i + 8 <= b.length; i += 8) o.push(parseInt(b.slice(i, i + 8), 2)); return Buffer.from(o); }
function totp(s) { const k = b32d(s), buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = crypto.createHmac('sha1', k).update(buf).digest(); const o = h[19] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); }
const adminSecret = () => execSync(`docker exec demo-lottery-postgres-1 psql -U lottery -d lottery -t -A -c "SELECT mfa_secret FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.name='super_admin' LIMIT 1"`).toString().trim();

const results = [];
async function step(name, fn) {
  try { await fn(); results.push(true); console.log(`  ✅ ${name}`); }
  catch (e) { results.push(false); console.log(`  ❌ ${name} — ${e.message.split('\n')[0].slice(0, 160)}`); }
}
const shot = async (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false }).catch(() => {});
// ปิด popup/celecration overlay ที่อาจบังหน้า (เช่น ชนะ Kiwi → "รับทราบ ขอบคุณ!")
async function dismissOverlays(page) {
  for (let i = 0; i < 5; i++) {
    const b = page.getByRole('button', { name: /รับทราบ|ขอบคุณ|×|ปิด/ }).first();
    if (await b.isVisible().catch(() => false)) { await b.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(500); }
    else break;
  }
}
// click ที่อดทนต่อ overlay — ลอง click จริง, ถ้าติด timeout ให้ปิด overlay แล้วลองใหม่, สุดท้าย dispatchEvent
async function resilientClick(page, locator, opts = {}) {
  for (let i = 0; i < 3; i++) {
    try { await locator.click({ timeout: 5000 }); return; }
    catch (e) {
      await dismissOverlays(page);
      if (i === 2) { await locator.dispatchEvent('click').catch(() => { throw e; }); return; }
    }
  }
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'th-TH' });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
const uname = 'uie2e' + Date.now().toString(36);
const pass = 'UiE2e@12345';

console.log(`UI E2E → ${BASE}\n`);

// ============ MEMBER ============
await step('home โหลด + เห็นโลโก้/ชื่อเว็บ', async () => {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.getByText(/DEMO LOTTERY|เกมด่วน/i).first().waitFor();
});

await step('สมัครสมาชิกผ่าน UI', async () => {
  await page.goto(BASE + '/register', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'ชื่อผู้ใช้' }).click();
  await page.getByPlaceholder(/ชื่อผู้ใช้/).fill(uname);
  await page.locator('input[type="password"]').first().fill(pass);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: /สมัครและเข้าใช้งาน/ }).click();
  await page.waitForURL(u => !u.pathname.includes('register'), { timeout: 15000 });
});

await step('เกมด่วน: Scratch ซื้อบัตร', async () => {
  await page.goto(BASE + '/scratch', { waitUntil: 'domcontentloaded' });
  const btn = page.getByRole('button', { name: /ซื้อบัตรเพิ่ม|เล่นเกม/ }).first();
  await btn.waitFor();
  await btn.click();
  await page.waitForTimeout(2500); // รอ buy + render card
  await shot(page, 'scratch-after-buy');
});

await step('เกมด่วน: Hilo เล่น (เลือก สูง)', async () => {
  await page.goto(BASE + '/hilo', { waitUntil: 'domcontentloaded' });
  // ถ้ามีตั๋วค้างให้ guess ก่อน หรือเล่นใหม่ — ลองกดปุ่มสูง/ต่ำที่เห็น
  const pick = page.getByRole('button', { name: /สูง|ต่ำ|11 ไฮโล/ }).first();
  await pick.waitFor();
  await pick.click();
  await page.waitForTimeout(2000);
  await shot(page, 'hilo-play');
});

await step('Kiwi เล่น', async () => {
  await page.goto(BASE + '/kiwi', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  // เลือกเลข 3 ตัวแรกที่เป็นไปได้ — กดปุ่มตัวเลข 3 ครั้ง
  const nums = page.locator('button').filter({ hasText: /^[0-9]+$/ });
  const n = await nums.count();
  for (let i = 0; i < Math.min(3, n); i++) await nums.nth(i).click().catch(() => {});
  const playBtn = page.getByRole('button', { name: /เล่น|ยืนยัน/ }).last();
  if (await playBtn.isEnabled().catch(() => false)) { await playBtn.click(); await page.waitForTimeout(2000); }
  await shot(page, 'kiwi-play');
});

await step('Wallet: เติมเครดิตผ่าน UI', async () => {
  await dismissOverlays(page);
  await page.goto(BASE + '/wallet', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await dismissOverlays(page);
  await resilientClick(page, page.getByRole('button', { name: /เติมเครดิต/ }).first());
  await page.waitForTimeout(800);
  // กรอกจำนวนเงิน 100 บาทในช่อง amount ของ modal
  const amtInp = page.locator('input[inputmode="decimal"], input[placeholder="0.00"]').first();
  await amtInp.fill('100');
  // เลขบัญชี (ถ้ามีช่อง)
  const accInp = page.locator('input[placeholder*="บัญชี"], input[placeholder*="พร้อมเพย์"], input[placeholder*="TrueMoney"]').first();
  if (await accInp.count()) await accInp.fill('1234567890');
  await resilientClick(page, page.getByRole('button', { name: /ยืนยันเติมเครดิต/ }));
  await page.waitForTimeout(2000);
  await shot(page, 'wallet-deposit');
});

await step('แทงหวยผ่าน UI (เลือกกติกา+สุ่มเลข+ยืนยัน)', async () => {
  await dismissOverlays(page);
  await page.goto(BASE + '/lotteries', { waitUntil: 'domcontentloaded' });
  const betLink = page.getByRole('link', { name: /แทงหวยรอบนี้|แทงปีนักษัตร/ }).first();
  await betLink.waitFor();
  await betLink.click();
  await page.waitForURL(/\/bet\//, { timeout: 15000 });
  // เลือกกติกาแรกที่เป็นเลข (ไม่ใช่วิ่ง/ราศี)
  const ruleBtns = page.locator('button').filter({ hasText: /3 ตัว|2 ตัว|บน|ล่าง/ });
  const rc = await ruleBtns.count();
  if (rc > 0) await ruleBtns.first().click();
  await page.waitForTimeout(500);
  // สุ่มเลข (ปุ่มสุ่ม)
  const rand = page.getByRole('button', { name: /สุ่ม/ }).first();
  if (await rand.count()) await rand.click();
  await page.waitForTimeout(300);
  // เพิ่มเข้โพย
  const add = page.getByRole('button', { name: /เพิ่ม|ใส่/ }).first();
  if (await add.count()) await add.click().catch(() => {});
  await page.waitForTimeout(500);
  // ตรวจสอบและยืนยัน
  const confirm = page.getByRole('button', { name: /ตรวจสอบและยืนยันโพย/ });
  if (await confirm.isEnabled().catch(() => false)) {
    await confirm.click();
    await page.waitForTimeout(800);
    const ok = page.getByRole('button', { name: /ยืนยันส่งโพย/ });
    if (await ok.count()) { await ok.click(); await page.waitForTimeout(2000); }
  }
  await shot(page, 'placebet');
});

await step('My Bets แสดงโพย', async () => {
  await page.goto(BASE + '/my-bets', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await shot(page, 'mybets');
});

await step('Results แสดงผล', async () => {
  await page.goto(BASE + '/results', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await shot(page, 'results');
});

// ============ ADMIN ============
const adminCtx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'th-TH' });
const ap = await adminCtx.newPage();
ap.setDefaultTimeout(15000);

await step('Admin login + MFA ผ่าน UI', async () => {
  await ap.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await ap.getByPlaceholder(/ชื่อผู้ใช้หรืออีเมล/).fill('admin');
  await ap.locator('input[type="password"]').first().fill('Admin@Demo123');
  await ap.getByRole('button', { name: /เข้าสู่ระบบ/ }).click();
  // MFA
  const mfa = ap.getByPlaceholder('000000');
  await mfa.waitFor({ timeout: 10000 });
  await mfa.fill(totp(adminSecret()));
  await ap.getByRole('button', { name: /ยืนยัน MFA/ }).click();
  await ap.waitForURL(u => !u.pathname.includes('login'), { timeout: 15000 });
});

await step('Admin /health หน้าใหม่ render', async () => {
  await ap.goto(BASE + '/admin/health', { waitUntil: 'domcontentloaded' });
  await ap.getByText('สุขภาพระบบ').first().waitFor({ timeout: 10000 });
  await ap.waitForTimeout(1500);
  await shot(ap, 'admin-health');
});

await step('Admin Lotteries: เปิดแก้ไข → แก้ค่า → บันทึก → confirm (regression)', async () => {
  await ap.goto(BASE + '/admin/lotteries', { waitUntil: 'domcontentloaded' });
  await ap.waitForTimeout(1500);
  const edit = ap.getByRole('button', { name: /แก้ไข/ }).first();
  await edit.waitFor({ timeout: 10000 });
  await edit.click();
  await ap.waitForTimeout(1000);
  // modal ต้องเปิด — หาช่อง input แรกใน modal แล้วแก้
  const modal = ap.locator('div[role="dialog"], .fixed.inset-0').last();
  const inp = ap.locator('input[type="number"], input[inputmode="decimal"]').first();
  if (await inp.count()) {
    const v = await inp.inputValue();
    await inp.fill(v); // ใส่ค่าเดิม — เทสว่า field edit ไม่เด้ง
  }
  await shot(ap, 'admin-rule-modal');
  const save = ap.getByRole('button', { name: /^บันทึก$/ }).last();
  await save.click();
  await ap.waitForTimeout(1200);
  // confirm dialog ต้องเด้ง (ข้อความ ยืนยันแก้ไขกติกา)
  const confirmTxt = ap.getByText(/ยืนยันแก้ไขกติกา|ยืนยันเพิ่มกติกา/);
  const hasConfirm = await confirmTxt.count() > 0;
  await shot(ap, 'admin-rule-confirm');
  if (!hasConfirm) throw new Error('confirm dialog ไม่เด้ง — regression!');
  // ยกเลิก confirm (ไม่ save จริง)
  await ap.getByRole('button', { name: 'ยกเลิก' }).last().click().catch(() => {});
});

await step('Admin Overview + Members render', async () => {
  await ap.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' });
  await ap.waitForTimeout(1200);
  await ap.goto(BASE + '/admin/members', { waitUntil: 'domcontentloaded' });
  await ap.waitForTimeout(1200);
  await shot(ap, 'admin-members');
});

await browser.close();
const fails = results.filter(x => !x).length;
console.log(`\n═══ UI E2E: ${results.length - fails}/${results.length} ผ่าน ═══`);
console.log(`screenshots → ${SHOTS}`);
process.exit(fails ? 1 : 0);
