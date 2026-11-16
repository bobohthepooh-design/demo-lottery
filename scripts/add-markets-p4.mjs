// P4: เพิ่มตลาดหวยย่อยจริงจาก lotterychecks.com
// - LAM  หวยลาวเช้า          (lao-morning, 08:30)      ← กติกา clone จาก LA
// - LADT หวยลาวพัฒนาเที่ยง    (lao-development-midday) ← กติกา clone จาก LAD
// - HNM  ฮานอยเช้า           (hanoi-morning, 08:30)    ← กติกา clone จาก HNN
// Idempotent — รันซ้ำได้
import { getDb } from '../server/src/db/index.js';

const db = getDb();
const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);

const MARKETS = [
  { type: 'LA', code: 'LAM',  name: 'หวยลาวเช้า',        pattern: 'daily 08:30', tpl: 'LA'  },
  { type: 'LA', code: 'LADT', name: 'หวยลาวพัฒนาเที่ยง',  pattern: 'daily 12:30', tpl: 'LAD' },
  { type: 'HN', code: 'HNM',  name: 'ฮานอยเช้า',         pattern: 'daily 08:30', tpl: 'HNN' },
];

for (const m of MARKETS) {
  const t = await one(`SELECT id FROM lottery_types WHERE code = ?`, m.type);
  if (!t) { console.log(`skip ${m.code}: type ${m.type} missing`); continue; }
  const tpl = await one(`SELECT id FROM lottery_categories WHERE lottery_type_id = ? AND code = ?`, t.id, m.tpl);
  if (!tpl) { console.log(`skip ${m.code}: template cat ${m.tpl} missing`); continue; }

  let cat = await one(`SELECT id FROM lottery_categories WHERE lottery_type_id = ? AND code = ?`, t.id, m.code);
  if (!cat) {
    await run(`INSERT INTO lottery_categories (lottery_type_id, code, name_th, draw_pattern) VALUES (?, ?, ?, ?)`,
      t.id, m.code, m.name, m.pattern);
    cat = await one(`SELECT id FROM lottery_categories WHERE lottery_type_id = ? AND code = ?`, t.id, m.code);
    console.log(`+ category ${m.code} (${m.name}) id=${cat.id}`);
  } else {
    console.log(`= category ${m.code} exists id=${cat.id}`);
  }

  const active = await one(`SELECT COUNT(*)::int AS c FROM lottery_rules WHERE category_id = ? AND is_active = 1`, cat.id);
  if (active.c > 0) { console.log(`  rules: ${active.c} active (skip clone)`); continue; }

  const r = await run(`INSERT INTO lottery_rules
      (lottery_type_id, category_id, bet_type, name_th, name_en, digits, match_config,
       payout_multiplier, stake_unit, min_amount, max_amount, is_active)
    SELECT lottery_type_id, ?, bet_type, name_th, name_en, digits, match_config,
           payout_multiplier, stake_unit, min_amount, max_amount, 1
    FROM lottery_rules WHERE category_id = ? AND is_active = 1`, cat.id, tpl.id);
  console.log(`  cloned ${r.changes} rules from ${m.tpl}`);
}

await db.close?.();
console.log('done');
