import { getDb, tx } from './index.js';

/**
 * Seed lottery categories + rules ตามโครงสร้างรางวัลจริงของแต่ละประเทศ:
 *
 * หวยไทย:      รางวัลที่ 1 (6 ตัว) | เลขหน้า 3 ตัว | เลขท้าย 3 ตัวบน | เลขท้าย 2 ตัว
 * หวยลาว:      เลขท้าย 4 ตัว | เลขท้าย 3 ตัว | เลขท้าย 2 ตัว
 * หวยลาวพัฒนา: เลขท้าย 2 ตัว (1 ประเภท — ผลมี 5 รางวัล)
 * ฮานอยทุกหมวด: เลข 4 ตัว | เลข 3 ตัวบน | เลข 2 ตัวบน | เลข 2 ตัวล่าง
 *
 * match_config: { source, mode } — source อ้าง field ใน winning_numbers
 * (รองรับ string หรือ array = หลายรางวัล), mode: exact | sorted | digit_contains | tail | head
 *
 * Idempotent: ปิดกติกาเก่าที่ active อยู่แล้ว insert ชุดใหม่ (bet_items อ้างอิง rule เดิมอยู่ ห้ามลบ)
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

    const LA = cat('LA', 'LA', 'หวยลาว', 'mon-fri');
    const LAD = cat('LA', 'LAD', 'หวยลาวพัฒนา 5/45', 'mon/wed/fri');
    const HNS = cat('HN', 'HNS', 'ฮานอยเฉพาะกิจ', 'special');
    const HNP = cat('HN', 'HNP', 'ฮานอยพิเศษ', 'special');
    const HNN = cat('HN', 'HNN', 'ฮานอยปกติ', 'daily');
    const HNV = cat('HN', 'HNV', 'ฮานอย VIP', 'vip');

    const tid = (code) => d.prepare('SELECT id FROM lottery_types WHERE code = ?').get(code)?.id;
    const TH = tid('TH'), LA_ID = tid('LA'), HN = tid('HN');
    // sync draw_pattern ของ category ที่มีอยู่แล้ว (INSERT OR IGNORE ไม่ update)
    d.prepare(`UPDATE lottery_categories SET draw_pattern='mon-fri' WHERE code='LA' AND lottery_type_id=?`).run(LA_ID);
    d.prepare(`UPDATE lottery_categories SET name_th='หวยลาวพัฒนา 5/45', draw_pattern='mon/wed/fri' WHERE code='LAD' AND lottery_type_id=?`).run(LA_ID);

    // ---------- ปิดกติกาเดิมที่ยัง active (rename กัน unique index ชน) ----------
    d.prepare(`UPDATE lottery_rules SET is_active = 0, bet_type = bet_type || '_old'
               WHERE is_active = 1 AND bet_type NOT LIKE '%\\_old' ESCAPE '\\'`).run();

    const rules = [];
    const push = (...a) => rules.push(rule(...a));

    // ===== หวยไทย =====
    // ผล: { first:'123456', front3:['123','321'], top3:['456','654'], bottom2:'56' }
    push(TH, null, 'first',    'รางวัลที่ 1',      6, 'first',    'exact',   60000);
    push(TH, null, 'front3',   'เลขหน้า 3 ตัว',    3, 'front3',   'exact',    4000);
    push(TH, null, 'top3',     'เลขท้าย 3 ตัวบน',  3, 'top3',     'exact',     900);
    push(TH, null, 'bottom2',  'เลขท้าย 2 ตัว',    2, 'bottom2',  'exact',     100);

    // ===== หวยลาว (LA) =====
    // ผล: { main:'123456', last4:'3456', last3:'456', last2:'56' }
    push(LA_ID, LA, 'last4', 'เลขท้าย 4 ตัว', 4, 'last4', 'exact', 6000);
    push(LA_ID, LA, 'last3', 'เลขท้าย 3 ตัว', 3, 'last3', 'exact',  900);
    push(LA_ID, LA, 'last2', 'เลขท้าย 2 ตัว', 2, 'last2', 'exact',  100);

    // ===== หวยลาวพัฒนา 5/45 (LAD) — เลือก 5 เลขจาก 1-45 ออก จ/พ/ศ =====
    // ผล: { numbers: ['12','7','34','19','45'] } — ตรงครบทั้ง 5 ตัวจ่ายใหญ่
    push(LA_ID, LAD, 'pattana5', 'สลากพัฒนา 5/45', 0, 'numbers', 'set5', 1000);

    // ===== ฮานอย (HN) — กติกาเดียวกันทุก category =====
    // ผล: { main:'123456', num4:'3456', top3:'456', top2:'56', bottom2:'78' }
    const hnRules = (catId) => {
      push(HN, catId, 'num4',     'เลข 4 ตัว',      4, 'num4',     'exact', 6000);
      push(HN, catId, 'top3',     'เลข 3 ตัวบน',    3, 'top3',     'exact',  900);
      push(HN, catId, 'top2',     'เลข 2 ตัวบน',    2, 'top2',     'exact',  100);
      push(HN, catId, 'bottom2',  'เลข 2 ตัวล่าง',  2, 'bottom2',  'exact',  100);
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
