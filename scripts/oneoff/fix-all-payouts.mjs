import { getDb } from './server/src/db/index.js';
const db = getDb();
const tid = (c) => db.prepare('SELECT id FROM lottery_types WHERE code=?').get(c)?.id;
const catId = (t, c) => db.prepare('SELECT id FROM lottery_categories WHERE lottery_type_id=? AND code=?').get(tid(t), c)?.id ?? null;

// อัตราเหมือนหวยไทย (ต่อ 1 บาท): 3บน=950, โต๊ด=150, 2บน/2ล่าง=95, วิ่งบน=3.2, วิ่งล่าง=4.2
// 4 ตัวไม่มีอัตราไทย → คง x800 | Hr/SC/HL คนละเกม → ไม่แตะ
const groups = [
  { t: 'TH', c: null,    src3: 'top3'  },
  { t: 'LA', c: 'LA',    src3: 'last3' },
  { t: 'LA', c: 'LADAM', src3: 'top3'  },
  { t: 'HN', c: 'HNS',   src3: 'top3'  },
  { t: 'HN', c: 'HNP',   src3: 'top3'  },
  { t: 'HN', c: 'HNN',   src3: 'top3'  },
  { t: 'HN', c: 'HNV',   src3: 'top3'  },
  { t: 'HN', c: 'HNST',  src3: 'top3'  },
];

const RATE3 = ['top3', 'last3'];           // 3 ตัวบน → 950
const RATE2 = ['top2', 'bottom2', 'last2']; // 2 ตัว → 95
const upd = db.prepare(`UPDATE lottery_rules SET payout_multiplier=?
  WHERE lottery_type_id=? AND COALESCE(category_id,0)=COALESCE(?,0) AND bet_type=? AND is_active=1`);
const ins = db.prepare(`INSERT INTO lottery_rules
  (lottery_type_id, category_id, bet_type, name_th, name_en, digits, match_config, payout_multiplier, stake_unit, min_amount, max_amount, is_active)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 100, 100, 1000000, 1)`);
const has = (t, c, bt) => db.prepare(`SELECT id FROM lottery_rules WHERE lottery_type_id=? AND COALESCE(category_id,0)=COALESCE(?,0) AND bet_type=? AND is_active=1`).get(t, c, bt);

let n = 0;
for (const g of groups) {
  const T = tid(g.t); if (!T) continue;
  const C = g.c ? catId(g.t, g.c) : null;
  for (const bt of RATE3) { const r = upd.run(950, T, C, bt); n += r.changes; }
  for (const bt of RATE2) { const r = upd.run(95, T, C, bt); n += r.changes; }
  // เพิ่มกติกาให้ครบเหมือนหวยไทย: 3 ตัวโต๊ด (sorted) + 2 ตัวบน (tail ของ 3 ตัวบน)
  if (!has(T, C, '3tod')) { ins.run(T, C, '3tod', 'เลข 3 ตัวโต๊ด', '3tod', 3, JSON.stringify({ source: g.src3, mode: 'sorted' }), 150); n++; }
  if (!has(T, C, 'top2'))  { ins.run(T, C, 'top2',  'เลข 2 ตัวบน',   'top2',  2, JSON.stringify({ source: g.src3, mode: 'tail'   }), 95);  n++; }
}
console.log('updated/inserted:', n);
console.log(db.prepare(`SELECT COALESCE(c.code,'-') cat, bet_type, payout_multiplier FROM lottery_rules r
  LEFT JOIN lottery_categories c ON c.id=r.category_id
  WHERE r.is_active=1 AND r.bet_type IN ('top3','last3','3tod','top2','bottom2','last2','run_top','run_bottom')
  ORDER BY r.lottery_type_id, r.category_id, r.bet_type`).all());
