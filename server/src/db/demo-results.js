import { getDb, isPg } from './index.js';
import { settleDraw } from '../services/lotteryService.js';
import { ZODIAC_SIGNS } from '../lib/zodiac.js';
import { q, qGet } from './pg.js';

/**
 * สร้างผลรางวัลตัวอย่างให้รอบที่เปิดรับอยู่ — รอบละ 1 ใบต่อประเทศ/หมวด
 * ใช้สำหรับ Demo เพื่อให้เห็นผลครบทุกประเทศบนหน้าแรก
 * Idempotent: ข้ามรอบที่ settle แล้ว (settleDraw จะ throw อยู่แล้ว — catch ไว้)
 */

const rnd = (n) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0');

const DRAWS_SQL = `
    SELECT d.id, d.draw_code, lt.code AS type_code, c.code AS category_code
    FROM lottery_draws d
    JOIN lottery_types lt ON lt.id = d.lottery_type_id
    LEFT JOIN lottery_categories c ON c.id = d.category_id
    WHERE d.status = 'open'
    ORDER BY d.draw_at ASC`;

function winningFor(typeCode, categoryCode) {
  if (typeCode === 'TH') {
    return {
      first: rnd(6),
      front3: [rnd(3), rnd(3)],
      top3: [rnd(3), rnd(3)],
      bottom2: rnd(2),
    };
  }
  if (typeCode === 'LA') {
    const main = rnd(6);
    if (categoryCode === 'LAD') {
      return { main, last2: [rnd(2), rnd(2), rnd(2), rnd(2), rnd(2)] };
    }
    return { main, last4: main.slice(-4), last3: main.slice(-3), last2: main.slice(-2) };
  }
  if (typeCode === 'HN') {
    const main = rnd(6);
    return { main, num4: rnd(4), top3: rnd(3), top2: rnd(2), bottom2: rnd(2) };
  }
  if (typeCode === 'HR') {
    const pool = [...ZODIAC_SIGNS];
    const seq = [];
    for (let i = 0; i < 6; i++) seq.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    return { zodiac: seq[0], seq };
  }
  return { main: rnd(6) };
}

async function settleOpenDraws(draws, admin) {
  const done = new Set();
  let settled = 0;
  for (const d of draws) {
    const key = `${d.type_code}:${d.category_code || ''}`;
    if (done.has(key)) continue;
    try {
      const w = winningFor(d.type_code, d.category_code);
      await settleDraw(admin, d.id, w);
      console.log(`[demo-results] settled ${d.draw_code} (${d.type_code}${d.category_code ? '/' + d.category_code : ''}) ->`, JSON.stringify(w));
      settled++;
    } catch (e) {
      console.log(`[demo-results] skip ${d.draw_code}: ${e.message}`);
    }
    done.add(key);
  }
  console.log(`[demo-results] settled ${settled} draws`);
  return settled;
}

function adminIdSync() {
  const db = getDb();
  return db.prepare(`SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id WHERE r.name = 'super_admin' LIMIT 1`).get()?.id
    ?? db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get()?.id;
}
async function adminIdPg() {
  return (await qGet(`SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id WHERE r.name = 'super_admin' LIMIT 1`))?.id
    ?? (await qGet('SELECT id FROM users ORDER BY id LIMIT 1'))?.id;
}

function seedDemoResultsSync() {
  const admin = adminIdSync();
  const draws = getDb().prepare(DRAWS_SQL).all();
  const done = new Set();
  let settled = 0;
  for (const d of draws) {
    const key = `${d.type_code}:${d.category_code || ''}`;
    if (done.has(key)) continue;
    try {
      const w = winningFor(d.type_code, d.category_code);
      settleDraw(admin, d.id, w);
      console.log(`[demo-results] settled ${d.draw_code} (${d.type_code}${d.category_code ? '/' + d.category_code : ''}) ->`, JSON.stringify(w));
      settled++;
    } catch (e) {
      console.log(`[demo-results] skip ${d.draw_code}: ${e.message}`);
    }
    done.add(key);
  }
  console.log(`[demo-results] settled ${settled} draws`);
  return settled;
}

async function seedDemoResultsPg() {
  const admin = await adminIdPg();
  const draws = await q(DRAWS_SQL);
  return settleOpenDraws(draws, admin);
}

// dual-mode: sqlite sync / pg คืน Promise
export function seedDemoResults() {
  return isPg() ? seedDemoResultsPg() : seedDemoResultsSync();
}

if (process.argv[1] && process.argv[1].endsWith('demo-results.js')) {
  Promise.resolve(seedDemoResults()).catch(e => { console.error(e); process.exit(1); });
}
