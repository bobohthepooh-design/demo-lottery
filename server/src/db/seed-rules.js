import { getDb, tx } from './index.js';

/**
 * Seed lottery categories + rules ตามโครงสร้างรางวัลจริง:
 *
 * หวยไทย:    รางวัลที่ 1 | เลขหน้า 3 ตัว ×2 | เลขท้าย 3 ตัว ×2 | เลขท้าย 2 ตัว ×1
 * หวยลาว:    เลขท้าย 4/3/2 ตัว
 * หวยลาวพัฒนา: เลขท้าย 2 ตัว (5 รางวัล)
 * ฮานอย (เฉพาะกิจ/พิเศษ/ปกติ/VIP): เลข 4 ตัว | 3 ตัวบน | 2 ตัวบน | 2 ตัวล่าง
 *
 * match_config: { source, mode }
 *   mode: exact | sorted | digit_contains | tail | head
 *   source อ้าง field ใน winning_numbers JSON (รองรับ string หรือ array ของ string = หลายรางวัล)
 *
 * Idempotent: ลบ lottery_rules เดิมแล้ว insert ชุดใหม่ ( DEMO — ไม่เก็บ custom rules )
 */

function rule(typeId, catId, betType, nameTh, digits, source, mode, mult, stakeUnit = 100, min = 100, max = 1000000) {
  return { typeId, catId, betType, nameTh, digits, match_config: JSON.stringify({ source, mode }), payout_multiplier: mult, stakeUnit, min, max };
}

export function seedRulesV2() {
  const db = getDb();
  tx((d) => {
    // ---------- categories ----------
    const cat = (typeCode, code, nameTh, pattern) => {
      const t = d.prepare('SELECT id FROM lottery_types WHERE code = ?').get(typeCode);
      if (!t) return null;
      d.prepare('INSERT OR IGNORE INTO lottery_categories (lottery_type_id, code, name_th, draw_pattern) VALUES (?, ?, ?, ?)')
        .run(t.id, code, nameTh, pattern);
      return d.prepare('SELECT id FROM lottery_categories WHERE lottery_type_id = ? AND code = ?').get(t.id, code).id;
    };

    const LA = cat('LA', 'LA', 'หวยลาว', 'mon/wed/fri');
    const LAD = cat('LA', 'LAD', 'หวยลาวพัฒนา', 'daily');
    const HNS = cat('HN', 'HNS', 'ฮานอยเฉพาะกิจ', 'special');
    const HNP = cat('HN', 'HNP', 'ฮานอยพิเศษ', 'special');
    const HNN = cat('HN', 'HNN', 'ฮานอยปกติ', 'daily');
    const HNV = cat('HN', 'HNV', 'ฮานอย VIP', 'vip');

    const tid = (code) => d.prepare('SELECT id FROM lottery_types WHERE code = ?').get(code)?.id;
    const TH = tid('TH'), LA_ID = tid('LA'), HN = tid('HN');

    // ---------- retire old rules (bet_items อ้างอิงอยู่ → เปลี่ยนชื่อ+ปิดแทนการลบ) ----------
    d.prepare(`UPDATE lottery_rules SET is_active = 0, bet_type = bet_type || '_v1'`).run();

    const rules = [];
    const push = (...a) => rules.push(rule(...a));

    // ===== หวยไทย =====
    // ผล: { first:'123456', front3:'123', top3:'456', bottom2:'56' }
    push(TH, null, 'p1',        'รางวัลที่ 1',        6, 'first',    'exact',          6000000 / 100, 100); // ≈ 60,000x
    push(TH, null, 'front3',    'เลขหน้า 3 ตัว',      3, 'front3',   'exact',          4000);
    push(TH, null, 'front3_tod','เลขหน้า 3 ตัวโต๊ด', 3, 'front3',   'sorted',         1000);
    push(TH, null, 'top3',      'เลขท้าย 3 ตัวบน',    3, 'top3',     'exact',          900);
    push(TH, null, 'top3_tod',  'เลขท้าย 3 ตัวโต๊ด',  3, 'top3',     'sorted',         150);
    push(TH, null, 'bottom2',   'เลขท้าย 2 ตัว',      2, 'bottom2', 'exact', 100);
    push(TH, null, 'bottom2_tod','เลขท้าย 2 ตัวโต๊ด',2, 'bottom2',   'sorted',         100);
    push(TH, null, 'run_top',   'วิ่งบน',              1, 'top3',     'digit_contains', 3.2);
    push(TH, null, 'run_bottom','วิ่งล่าง',            1, 'bottom2',  'digit_contains', 4);

    // ===== หวยลาว (LA) =====
    // ผล: { last4:'1234', last3:'234', last2:'34' }
    push(LA_ID, LA, 'last4', 'เลขท้าย 4 ตัว', 4, 'last4', 'exact', 6000);
    push(LA_ID, LA, 'last3', 'เลขท้าย 3 ตัว', 3, 'last3', 'exact', 900);
    push(LA_ID, LA, 'last3_tod', 'เลขท้าย 3 ตัวโต๊ด', 3, 'last3', 'sorted', 150);
    push(LA_ID, LA, 'last2', 'เลขท้าย 2 ตัว', 2, 'last2', 'exact', 100);
    push(LA_ID, LA, 'last2_tod', 'เลขท้าย 2 ตัวโต๊ด', 2, 'last2', 'sorted', 100);
    push(LA_ID, LA, 'run_top', 'วิ่งบน', 1, 'last3', 'digit_contains', 3.2);
    push(LA_ID, LA, 'run_bottom', 'วิ่งล่าง', 1, 'last2', 'digit_contains', 4);

    // ===== หวยลาวพัฒนา (LAD) — เลขท้าย 2 ตัว 5 รางวัล =====
    // ผล: { last2: ['12','34','56','78','90'] } (array = หลายรางวัล)
    push(LA_ID, LAD, 'last2', 'เลขท้าย 2 ตัว (5 รางวัล)', 2, 'last2', 'exact', 20);

    // ===== ฮานอย (HN) — ใช้กติกาเดียวกันทุก category =====
    // ผล: { num4:'1234', top3:'234', top2:'34', bottom2:'34' }
    const hnRules = (catId) => {
      push(HN, catId, 'num4',      'เลข 4 ตัว',      4, 'num4',    'exact', 6000);
      push(HN, catId, 'top3',      'เลข 3 ตัวบน',    3, 'top3',    'exact', 900);
      push(HN, catId, 'top3_tod',  'เลข 3 ตัวโต๊ด',  3, 'top3',    'sorted', 150);
      push(HN, catId, 'top2',      'เลข 2 ตัวบน',    2, 'top2',    'exact', 100);
      push(HN, catId, 'bottom2',   'เลข 2 ตัวล่าง',  2, 'bottom2', 'exact', 100);
      push(HN, catId, 'run_top',   'วิ่งบน',          1, 'num4',    'digit_contains', 3.2);
      push(HN, catId, 'run_bottom','วิ่งล่าง',        1, 'bottom2', 'digit_contains', 4);
    };
    hnRules(HNS); hnRules(HNP); hnRules(HNN); hnRules(HNV);

    const ins = d.prepare(`INSERT INTO lottery_rules
      (lottery_type_id, category_id, bet_type, name_th, name_en, digits, match_config, payout_multiplier, stake_unit, min_amount, max_amount, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 100, 100, 1000000, 1)`);
    for (const r of rules) {
      ins.run(r.typeId, r.catId, r.betType, r.nameTh, r.betType, r.digits, r.match_config, r.payout_multiplier);
    }
    console.log(`[seed-rules] ${rules.length} rules, categories: LA=${LA} LAD=${LAD} HN=${HNS},${HNP},${HNN},${HNV}`);
  });
}

if (process.argv[1] && process.argv[1].endsWith('seed-rules.js')) {
  seedRulesV2();
}
