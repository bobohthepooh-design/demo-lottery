import { getDb, tx, txAsync, isPg } from './index.js';

/**
 * Seed lottery categories + rules ตามโครงสร้างรางวัลจริงของแต่ละประเทศ:
 *
 * หวยไทย:      รางวัลที่ 1 (6 ตัว) | เลขหน้า 3 ตัว | เลขท้าย 3 ตัวบน | เลขท้าย 2 ตัว
 * หวยลาว:      เลขท้าย 4 ตัว | เลขท้าย 3 ตัว | เลขท้าย 2 ตัว
 * หวยลาวพัฒนา: เลข 4 ตัว | เลข 3 ตัวบน + เลข 2 ตัวล่าง (ค่ำ จ–ศ 20:30 / เช้า ทุกวัน 09:00)
 * ฮานอยทุกหมวด: เลข 4 ตัว | เลข 3 ตัวบน | เลข 2 ตัวบน | เลข 2 ตัวล่าง
 *
 * match_config: { source, mode } — source อ้าง field ใน winning_numbers
 * (รองรับ string หรือ array = หลายรางวัล), mode: exact | sorted | digit_contains | tail | head
 *
 * Idempotent: ปิดกติกาเก่าที่ active อยู่แล้ว insert ชุดใหม่ (bet_items อ้างอิง rule เดิมอยู่ ห้ามลบ)
 */

function rule(typeId, catId, betType, nameTh, digits, source, mode, mult, stakeUnit = 100, min = 100, max = 1000000, tod = null) {
  // tod = อัตราโต๊ด —Poker ไม่ได้แทงประเภทโต๊ดแยก: ถ้าเลขครบทุกหลักแต่สลับลำดับ → จ่ายตามอัตรานี้
  return { typeId, catId, betType, nameTh, digits, match_config: JSON.stringify({ source, mode, ...(tod ? { tod } : {}) }), payout_multiplier: mult, stakeUnit, min, max };
}

// ชื่อหมวด/ประเภท — ใช้ร่วมกันทั้ง 2 dialect
const CAT_DEFS = [
  ['LA', 'LA', 'หวยลาว', 'mon-fri'],
  ['LA', 'LAD', 'หวยลาวพัฒนา', 'mon-fri 20:30'],
  ['LA', 'LADAM', 'หวยลาวพัฒนาเช้า', 'daily 09:00'],
  ['HN', 'HNS', 'ฮานอยเฉพาะกิจ', 'special'],
  ['HN', 'HNP', 'ฮานอยพิเศษ', 'special'],
  ['HN', 'HNN', 'ฮานอยปกติ', 'daily'],
  ['HN', 'HNV', 'ฮานอย VIP', 'vip'],
  ['HN', 'HNST', 'ฮานอยทางการ', 'mon-thu 18:15'],
];

// สร้างรายการ rules ทั้งหมด (pure — ไม่แตะ db)
function buildRules(d) {
  const cat = async (typeCode, code, nameTh, pattern) => {
    const t = await d.prepare('SELECT id FROM lottery_types WHERE code = ?').get(typeCode);
    if (!t) return null;
    await d.prepare('INSERT OR IGNORE INTO lottery_categories (lottery_type_id, code, name_th, draw_pattern) VALUES (?, ?, ?, ?)')
      .run(t.id, code, nameTh, pattern);
    return (await d.prepare('SELECT id FROM lottery_categories WHERE lottery_type_id = ? AND code = ?').get(t.id, code)).id;
  };

  const rules = [];
  const push = (...a) => rules.push(rule(...a));
  const tid = async (code) => (await d.prepare('SELECT id FROM lottery_types WHERE code = ?').get(code))?.id;

  return (async () => {
    let LA, LAD, LADAM, HNS, HNP, HNN, HNV, HNST;
    for (const [tc, code, nameTh, pattern] of CAT_DEFS) {
      const id = await cat(tc, code, nameTh, pattern);
      if (tc === 'LA') { if (code === 'LA') LA = id; else if (code === 'LAD') LAD = id; else LADAM = id; }
      else { if (code === 'HNS') HNS = id; else if (code === 'HNP') HNP = id; else if (code === 'HNN') HNN = id; else if (code === 'HNV') HNV = id; else HNST = id; }
    }
    // sync draw_pattern ของ category ที่มีอยู่แล้ว (INSERT OR IGNORE ไม่ update)
    const LA_ID = await tid('LA');
    await d.prepare(`UPDATE lottery_categories SET draw_pattern='mon-fri' WHERE code='LA' AND lottery_type_id=?`).run(LA_ID);
    await d.prepare(`UPDATE lottery_categories SET name_th='หวยลาวพัฒนา', draw_pattern='mon-fri 20:30' WHERE code='LAD' AND lottery_type_id=?`).run(LA_ID);

    const TH = await tid('TH'), HN = await tid('HN'), HR = await tid('HR');

    // ---------- ปิดกติกาเดิมที่ยัง active — เปลี่ยนชื่อให้ unique ต่อ row (กันชน idx_rules_uniq) ----------
    // CAST(id AS TEXT) ใช้ได้ทั้ง SQLite และ PostgreSQL (|| text+int ใช้ไม่ได้ใน PG)
    await d.prepare(`UPDATE lottery_rules SET is_active = 0, bet_type = bet_type || '_old_' || CAST(id AS TEXT)
               WHERE is_active = 1`).run();

    // ===== หวยไทย — อัตราจ่ายตามกติกาหวยรัฐบาลไทย (ต่อ 1 บาท) =====
    // โต๊ดไม่ใช่ประเภทแทงแยก — อยู่ใน match_config.tod ของกติกาเต็ง (3หลัก=150, 2หลัก=45)
    // ผล: { first:'123456', front3:['123','321'], top3:['456','654'], bottom2:'56' }
    push(TH, null, 'first',    'รางวัลที่ 1 (6 หลัก)', 6, 'first',    'exact', 1000);
    push(TH, null, 'front3',   'เลข 3 ตัวหน้า',   3, 'front3',   'exact', 900, 100, 100, 1000000, 150);
    push(TH, null, 'top3',     'เลข 3 ตัวหลัง',   3, 'top3',     'exact', 900, 100, 100, 1000000, 150);
    push(TH, null, 'bottom2',  'เลขท้าย 2 ตัวล่าง',2, 'bottom2',  'exact', 90, 100, 100, 1000000, 45);
    // เลขวิ่ง —stake 1 หลัก ตรงกับ digit ใดก็ได้ในผล (บน=top3, ล่าง=bottom2)
    push(TH, null, 'run_top',  'เลขวิ่งบน',        1, 'top3',     'digit_contains', 3.2);
    push(TH, null, 'run_bottom','เลขวิ่งล่าง',     1, 'bottom2',  'digit_contains', 4.2);

    // ===== หวยลาว (LA) — ผลจริงมีรางวัล เลขท้าย 4/3/2 ตัว + เลข 2 ตัวล่าง(หลักหมื่น-พัน) =====
    // ผล: { main:'123456', last4:'3456', last3:'456', last2:'56', bottom2:'45'(หลักหมื่น-พัน) }
    push(LA_ID, LA, 'last4',   'เลขท้าย 4 ตัว',   4, 'last4',   'exact', 1000);
    push(LA_ID, LA, 'last3',   'เลข 3 ตัว',      3, 'last3',   'exact', 900, 100, 100, 1000000, 150);
    push(LA_ID, LA, 'last2',   'เลข 2 ตัวบน',    2, 'last2',   'exact', 90,  100, 100, 1000000, 45);
    push(LA_ID, LA, 'bottom2', 'เลข 2 ตัวล่าง',  2, 'bottom2', 'exact', 90,  100, 100, 1000000, 45);

    // (หวยลาวพัฒนา LAD ปิดให้บริการ — ไม่มีแหล่งผลจริงแยกจากหวยลาวหลัก จึงไม่ seed กติกา/รอบใหม่)

    // ===== หวยลาวพัฒนาเช้า (LADAM) — ทุกวัน 09:00 — ตามตลาดจริง: 4ตัว/3บน/2บน/2ล่าง/วิ่งบน/ล่าง =====
    push(LA_ID, LADAM, 'num4',     'เลข 4 ตัว',      4, 'num4',     'exact', 1000);
    push(LA_ID, LADAM, 'top3',     'เลข 3 ตัวบน',    3, 'top3',     'exact', 900,  100, 100, 1000000, 150);
    push(LA_ID, LADAM, 'top2',     'เลข 2 ตัวบน',    2, 'top3',     'tail',   90,  100, 100, 1000000, 45);
    push(LA_ID, LADAM, 'bottom2',  'เลข 2 ตัวล่าง',  2, 'bottom2',  'exact', 90,  100, 100, 1000000, 45);
    push(LA_ID, LADAM, 'run_top',  'เลขวิ่งบน',      1, 'top3',     'digit_contains', 3.2);
    push(LA_ID, LADAM, 'run_bottom','เลขวิ่งล่าง',   1, 'bottom2',  'digit_contains', 4.2);

    // ===== ฮานอย (HN) — ตามตลาดจริงเหมือนหวยไทย: 4ตัว/3บน/2บน/2ล่าง/วิ่งบน/วิ่งล่าง =====
    // top2 = 2 ตัวท้ายของ top3 (คำนวณได้ทุกแหล่ง รวม lotterychecks ที่ไม่มี field top2)
    // ผล: { num4, top3, top2, bottom2, db5 }
    const hnRules = (catId) => {
      push(HN, catId, 'num4',     'เลข 4 ตัว',      4, 'num4',     'exact', 1000);
      push(HN, catId, 'top3',     'เลข 3 ตัวบน',    3, 'top3',     'exact', 850, 100, 100, 1000000, 140);
      push(HN, catId, 'top2',     'เลข 2 ตัวบน',    2, 'top3',     'tail',   90,  100, 100, 1000000, 45);
      push(HN, catId, 'bottom2',  'เลข 2 ตัวล่าง',  2, 'bottom2',  'exact', 90,  100, 100, 1000000, 45);
      push(HN, catId, 'run_top',  'เลขวิ่งบน',      1, 'top3',     'digit_contains', 3.2);
      push(HN, catId, 'run_bottom','เลขวิ่งล่าง',   1, 'bottom2',  'digit_contains', 4.2);
    };
    [HNN, HNS, HNP, HNV, HNST].forEach(c => c && hnRules(c));

    // ===== เลขอั้น — ไม่ใช่ประเภทแทงแยก: ผู้แทงใช้กติกาปกติ ถ้าเลขตรงเลขอั้นที่ admin
    // ประกาศรายรอบ → จ่ายตามอัตราเลขอั้น (ann_<side>_pay) หรือครึ่งหนึ่งของอัตรากติกานั้น
    // (ไม่ seed กติกา ann_* — โมเดลนี้ไม่ต้องการประเภทการแทงแยก)

    // ===== หวยราศี (HR) — ออกทุกชั่วโมงนาฬิกา ผลเป็นลำดับปีนักษัตรไทย 6 ตัว (เหมือนหวยไทย) =====
    // ผล: { zodiac:'ขาล', seq:['ขาล','เถาะ','มะโรง','มะเส็ง','มะเมีย','มะแม'] }
    if (HR) {
      push(HR, null, 'zodiac',       'รางวัลใหญ่ — ปีนักษัตรตัวแรกของผล', 1, 'zodiac', 'exact',    11);
      push(HR, null, 'zodiac3top',   '3 ปีนักษัตรบน — 3 ตัวท้ายเรียงถูก',   3, 'seq',    'seq_tail', 1000);
      push(HR, null, 'zodiac2bottom','2 ปีนักษัตรล่าง — 2 ตัวท้ายเรียงถูก',  2, 'seq',    'seq_tail', 110);
      push(HR, null, 'zodiac_run',   'วิ่งปีนักษัตร — โผล่ในผล 6 ตัวก็ถูก', 1, 'seq',    'contains', 1.9);
    }

    return rules;
  })();
}

async function seedRulesV2Pg() {
  const rules = await txAsync(async (d) => {
    const rs = await buildRules(d);
    const ins = d.prepare(`INSERT INTO lottery_rules
      (lottery_type_id, category_id, bet_type, name_th, name_en, digits, match_config, payout_multiplier, stake_unit, min_amount, max_amount, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 100, 100, 1000000, 1)`);
    for (const r of rs) {
      await ins.run(r.typeId, r.catId, r.betType, r.nameTh, r.betType, r.digits, r.match_config, r.payout_multiplier);
    }
    return rs;
  });
  console.log(`[seed-rules] ${rules.length} rules (pg)`);
}

function seedRulesV2Sync() {
  const db = getDb();
  tx((d) => {
    const g = (sql, ...a) => d.prepare(sql).get(...a);
    const run = (sql, ...a) => d.prepare(sql).run(...a);
    const cat = (typeCode, code, nameTh, pattern) => {
      const t = g('SELECT id FROM lottery_types WHERE code = ?', typeCode);
      if (!t) return null;
      run('INSERT OR IGNORE INTO lottery_categories (lottery_type_id, code, name_th, draw_pattern) VALUES (?, ?, ?, ?)',
        t.id, code, nameTh, pattern);
      return g('SELECT id FROM lottery_categories WHERE lottery_type_id = ? AND code = ?', t.id, code).id;
    };

    const LA = cat('LA', 'LA', 'หวยลาว', 'mon-fri');
    const LAD = cat('LA', 'LAD', 'หวยลาวพัฒนา', 'mon-fri 20:30');
    const LADAM = cat('LA', 'LADAM', 'หวยลาวพัฒนาเช้า', 'daily 09:00');
    const HNS = cat('HN', 'HNS', 'ฮานอยเฉพาะกิจ', 'special');
    const HNP = cat('HN', 'HNP', 'ฮานอยพิเศษ', 'special');
    const HNN = cat('HN', 'HNN', 'ฮานอยปกติ', 'daily');
    const HNV = cat('HN', 'HNV', 'ฮานอย VIP', 'vip');
    const HNST = cat('HN', 'HNST', 'ฮานอยทางการ', 'mon-thu 18:15');

    const tid = (code) => g('SELECT id FROM lottery_types WHERE code = ?', code)?.id;
    const TH = tid('TH'), LA_ID = tid('LA'), HN = tid('HN'), HR = tid('HR');
    // sync draw_pattern ของ category ที่มีอยู่แล้ว (INSERT OR IGNORE ไม่ update)
    run(`UPDATE lottery_categories SET draw_pattern='mon-fri' WHERE code='LA' AND lottery_type_id=?`, LA_ID);
    run(`UPDATE lottery_categories SET name_th='หวยลาวพัฒนา', draw_pattern='mon-fri 20:30' WHERE code='LAD' AND lottery_type_id=?`, LA_ID);

    // ---------- ปิดกติกาเดิมที่ยัง active — เปลี่ยนชื่อให้ unique ต่อ row (กันชน idx_rules_uniq) ----------
    run(`UPDATE lottery_rules SET is_active = 0, bet_type = bet_type || '_old_' || CAST(id AS TEXT)
               WHERE is_active = 1`);

    const rules = [];
    const push = (...a) => rules.push(rule(...a));

    // ===== หวยไทย — อัตราจ่ายตามกติกาหวยรัฐบาลไทย (ต่อ 1 บาท) =====
    push(TH, null, 'first',    'รางวัลที่ 1 (6 หลัก)', 6, 'first',    'exact', 1000);
    push(TH, null, 'front3',   'เลข 3 ตัวหน้า',   3, 'front3',   'exact', 900, 100, 100, 1000000, 150);
    push(TH, null, 'top3',     'เลข 3 ตัวหลัง',   3, 'top3',     'exact', 900, 100, 100, 1000000, 150);
    push(TH, null, 'bottom2',  'เลขท้าย 2 ตัวล่าง',2, 'bottom2',  'exact', 90, 100, 100, 1000000, 45);
    push(TH, null, 'run_top',  'เลขวิ่งบน',        1, 'top3',     'digit_contains', 3.2);
    push(TH, null, 'run_bottom','เลขวิ่งล่าง',     1, 'bottom2',  'digit_contains', 4.2);

    // ===== หวยลาว (LA) =====
    push(LA_ID, LA, 'last4',   'เลขท้าย 4 ตัว',   4, 'last4',   'exact', 1000);
    push(LA_ID, LA, 'last3',   'เลข 3 ตัว',      3, 'last3',   'exact', 900, 100, 100, 1000000, 150);
    push(LA_ID, LA, 'last2',   'เลข 2 ตัวบน',    2, 'last2',   'exact', 90,  100, 100, 1000000, 45);
    push(LA_ID, LA, 'bottom2', 'เลข 2 ตัวล่าง',  2, 'bottom2', 'exact', 90,  100, 100, 1000000, 45);

    // ===== หวยลาวพัฒนาเช้า (LADAM) =====
    push(LA_ID, LADAM, 'num4',     'เลข 4 ตัว',      4, 'num4',     'exact', 1000);
    push(LA_ID, LADAM, 'top3',     'เลข 3 ตัวบน',    3, 'top3',     'exact', 900,  100, 100, 1000000, 150);
    push(LA_ID, LADAM, 'top2',     'เลข 2 ตัวบน',    2, 'top3',     'tail',   90,  100, 100, 1000000, 45);
    push(LA_ID, LADAM, 'bottom2',  'เลข 2 ตัวล่าง',  2, 'bottom2',  'exact', 90,  100, 100, 1000000, 45);
    push(LA_ID, LADAM, 'run_top',  'เลขวิ่งบน',      1, 'top3',     'digit_contains', 3.2);
    push(LA_ID, LADAM, 'run_bottom','เลขวิ่งล่าง',   1, 'bottom2',  'digit_contains', 4.2);

    // ===== ฮานอย (HN) =====
    const hnRules = (catId) => {
      push(HN, catId, 'num4',     'เลข 4 ตัว',      4, 'num4',     'exact', 1000);
      push(HN, catId, 'top3',     'เลข 3 ตัวบน',    3, 'top3',     'exact', 850, 100, 100, 1000000, 140);
      push(HN, catId, 'top2',     'เลข 2 ตัวบน',    2, 'top3',     'tail',   90,  100, 100, 1000000, 45);
      push(HN, catId, 'bottom2',  'เลข 2 ตัวล่าง',  2, 'bottom2',  'exact', 90,  100, 100, 1000000, 45);
      push(HN, catId, 'run_top',  'เลขวิ่งบน',      1, 'top3',     'digit_contains', 3.2);
      push(HN, catId, 'run_bottom','เลขวิ่งล่าง',   1, 'bottom2',  'digit_contains', 4.2);
    };
    [HNN, HNS, HNP, HNV, HNST].forEach(c => c && hnRules(c));

    // ===== หวยราศี (HR) =====
    if (HR) {
      push(HR, null, 'zodiac',       'รางวัลใหญ่ — ปีนักษัตรตัวแรกของผล', 1, 'zodiac', 'exact',    11);
      push(HR, null, 'zodiac3top',   '3 ปีนักษัตรบน — 3 ตัวท้ายเรียงถูก',   3, 'seq',    'seq_tail', 1000);
      push(HR, null, 'zodiac2bottom','2 ปีนักษัตรล่าง — 2 ตัวท้ายเรียงถูก',  2, 'seq',    'seq_tail', 110);
      push(HR, null, 'zodiac_run',   'วิ่งปีนักษัตร — โผล่ในผล 6 ตัวก็ถูก', 1, 'seq',    'contains', 1.9);
    }

    const ins = d.prepare(`INSERT INTO lottery_rules
      (lottery_type_id, category_id, bet_type, name_th, name_en, digits, match_config, payout_multiplier, stake_unit, min_amount, max_amount, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 100, 100, 1000000, 1)`);
    for (const r of rules) {
      ins.run(r.typeId, r.catId, r.betType, r.nameTh, r.betType, r.digits, r.match_config, r.payout_multiplier);
    }
    console.log(`[seed-rules] ${rules.length} rules, categories: LA=${LA} LAD=${LAD} HN=${HNS},${HNP},${HNN},${HNV},${HNST}`);
  });
}

// dual-mode: sqlite sync / pg คืน Promise
export function seedRulesV2() {
  return isPg() ? seedRulesV2Pg() : seedRulesV2Sync();
}

if (process.argv[1] && process.argv[1].endsWith('seed-rules.js')) {
  Promise.resolve(seedRulesV2()).catch(e => { console.error(e); process.exit(1); });
}
