import { txAsync } from './index.js';

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
  ['LA', 'LAM', 'หวยลาวเช้า', 'daily 08:30'],
  ['LA', 'LADT', 'หวยลาวพัฒนาเที่ยง', 'daily 12:30'],
  ['HN', 'HNS', 'ฮานอยเฉพาะกิจ', 'special'],
  ['HN', 'HNP', 'ฮานอยพิเศษ', 'special'],
  ['HN', 'HNN', 'ฮานอยปกติ', 'daily'],
  ['HN', 'HNV', 'ฮานอย VIP', 'vip'],
  ['HN', 'HNM', 'ฮานอยเช้า', 'daily 08:30'],
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
    const cats = {};
    for (const [tc, code, nameTh, pattern] of CAT_DEFS) {
      const id = await cat(tc, code, nameTh, pattern);
      cats[`${tc}:${code}`] = id;
    }
    const LA = cats['LA:LA'], LAD = cats['LA:LAD'], LADAM = cats['LA:LADAM'],
          LAM = cats['LA:LAM'], LADT = cats['LA:LADT'],
          HNS = cats['HN:HNS'], HNP = cats['HN:HNP'], HNN = cats['HN:HNN'],
          HNV = cats['HN:HNV'], HNM = cats['HN:HNM'], HNST = cats['HN:HNST'];
    // sync draw_pattern ของ category ที่มีอยู่แล้ว (INSERT OR IGNORE ไม่ update)
    const LA_ID = await tid('LA');
    await d.prepare(`UPDATE lottery_categories SET draw_pattern='mon-fri' WHERE code='LA' AND lottery_type_id=?`).run(LA_ID);
    await d.prepare(`UPDATE lottery_categories SET name_th='หวยลาวพัฒนา', draw_pattern='mon-fri 20:30' WHERE code='LAD' AND lottery_type_id=?`).run(LA_ID);

    const TH = await tid('TH'), HN = await tid('HN'), HR = await tid('HR'), GS = await tid('GS');

    // ---------- ปิดกติกาเดิมที่ยัง active — เปลี่ยนชื่อให้ unique ต่อ row (กันชน idx_rules_uniq) ----------
    // CAST(id AS TEXT) ใช้ได้ทั้ง SQLite และ PostgreSQL (|| text+int ใช้ไม่ได้ใน PG)
    await d.prepare(`UPDATE lottery_rules SET is_active = 0, bet_type = bet_type || '_old_' || CAST(id AS TEXT)
               WHERE is_active = 1`).run();

    // ===== หวยไทย — spec: บน 4/3/2 จากท้าย รางวัล 1, หน้า/หลัง/ล่าง = เลขแยก, วิ่ง = ตัวสุดท้าย =====
    // ผล: { first, top4/top3/top2(ท้าย รางวัล1), front3, last3, bottom2, last1, bottom1 }
    push(TH, null, 'front3',   'เลข 3 ตัวหน้า',   3, 'front3',   'exact', 900, 100, 100, 1000000, 150);
    push(TH, null, 'top3',     'เลข 3 ตัวหลัง',   3, 'last3',    'exact', 900, 100, 100, 1000000, 150);
    push(TH, null, '2top',     'เลข 2 ตัวบน',     2, 'top2',     'exact', 95);
    push(TH, null, '3top',     'เลข 3 ตัวบน',     3, 'top3',     'exact', 900, 100, 100, 1000000, 150);
    push(TH, null, 'top4',     'เลข 4 ตัวบน',     4, 'top4',     'exact', 8000);
    push(TH, null, 'bottom2',  'เลข 2 ตัวล่าง',   2, 'bottom2',  'exact', 90, 100, 100, 1000000, 45);
    push(TH, null, 'run_top',  'เลขวิ่งบน',       1, 'last1',    'digit_contains', 3.2);
    push(TH, null, 'run_bottom','เลขวิ่งล่าง',    1, 'bottom1',  'digit_contains', 4.2);

    // ===== หวยลาว + ฮานอย — spec: เลข 5/4/3/2/1 ตัวท้าย ทั้งหมดจากเลขรางวัลหลัก (last5..last1) =====
    const suffixRules = (typeId, catId) => {
      push(typeId, catId, 'num5', 'เลข 5 ตัว', 5, 'last5', 'exact', 50000);
      push(typeId, catId, 'num4', 'เลข 4 ตัว', 4, 'last4', 'exact', 6000);
      push(typeId, catId, 'num3', 'เลข 3 ตัว', 3, 'last3', 'exact', 900);
      push(typeId, catId, 'num2', 'เลข 2 ตัว', 2, 'last2', 'exact', 90);
      push(typeId, catId, 'num1', 'เลข 1 ตัว', 1, 'last1', 'exact', 9.5);
    };
    [LA, LAD, LADAM, LAM, LADT].forEach(c => c && suffixRules(LA_ID, c));
    [HNS, HNP, HNN, HNV, HNM, HNST].forEach(c => c && suffixRules(HN, c));

    // ===== สลากออมสิน (GS) — spec: รูปแบบเดียวกับหวยไทย (ออมสินไม่มีรางวัลหน้า 3 ตัวแยก) — ออกวันที่ 1&16 =====
    // ผล: { p1..p5 (อันดับ 1-5), top4/top3/top2/last3/bottom2/last1/bottom1 derive จากอันดับ 1 }
    if (GS) {
      push(GS, null, 'top4',     'เลข 4 ตัวบน',   4, 'top4',     'exact', 9000);
      push(GS, null, '3top',     'เลข 3 ตัวบน',   3, 'top3',     'exact', 900, 100, 100, 1000000, 150);
      push(GS, null, '2top',     'เลข 2 ตัวบน',   2, 'top2',     'exact', 95);
      push(GS, null, 'top3',     'เลข 3 ตัวหลัง', 3, 'last3',    'exact', 900, 100, 100, 1000000, 150);
      push(GS, null, 'bottom2',  'เลข 2 ตัวล่าง', 2, 'bottom2',  'exact', 90, 100, 100, 1000000, 45);
      push(GS, null, 'run_top',  'เลขวิ่งบน',     1, 'last1',    'digit_contains', 3.2);
      push(GS, null, 'run_bottom','เลขวิ่งล่าง',  1, 'bottom1',  'digit_contains', 4.2);
    }

    // ===== เลขอั้น — ไม่ใช่ประเภทแทงแยก: ผู้แทงใช้กติกาปกติ ถ้าเลขตรงเลขอั้นที่ admin
    // ประกาศรายรอบ → จ่ายตามอัตราเลขอั้น (ann_<side>_pay) หรือครึ่งหนึ่งของอัตรากติกานั้น
    // (ไม่ seed กติกา ann_* — โมเดลนี้ไม่ต้องการประเภทการแทงแยก)

    // ===== หวยราศี (HR) — ออกทุก 15 นาที ผลเป็นลำดับปีนักษัตรไทย 6 ตัว (เหมือนหวยไทย) =====
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

export async function seedRulesV2() {
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
  console.log(`[seed-rules] ${rules.length} rules`);
}


if (process.argv[1] && process.argv[1].endsWith('seed-rules.js')) {
  Promise.resolve(seedRulesV2()).catch(e => { console.error(e); process.exit(1); });
}
