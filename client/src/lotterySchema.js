// โครงสร้างผลรางวัลและประเภทการแทงของหวยแต่ละประเทศ
// ใช้ร่วมกันระหว่าง WinningBoard (แสดงผล) และหน้า admin settle (กรอกผล)
// key ของ field ต้องตรงกับ source ใน lottery_rules.match_config
// (ยกเว้น field ที่ optional/display-only เช่น main)
// short = ป้ายย่อสำหรับแถวผลแบบบรรทัดเดียวบนหน้าแรก

const TH = {
  hero: 'first',
  fields: [
    { key: 'first',    label: 'รางวัลที่ 1',       short: 'รางวัล1', digits: 6, prizes: 1, hero: true },
    { key: 'front3',   label: 'เลขหน้า 3 ตัว',     short: 'หน้า3',   digits: 3, prizes: 2 },
    { key: 'top3',     label: 'เลขท้าย 3 ตัวบน',   short: 'ท้าย3',   digits: 3, prizes: 2 },
    { key: 'bottom2',  label: 'เลขท้าย 2 ตัว',     short: 'ท้าย2',   digits: 2, prizes: 1 },
  ],
};

const LA = {
  hero: 'main',
  fields: [
    { key: 'main',    label: 'เลขหลัก',          short: 'หลัก',   digits: 6, optional: true },
    { key: 'last4',   label: 'เลขท้าย 4 ตัว',     short: 'ท้าย4',   digits: 4, prizes: 1 },
    { key: 'last3',   label: 'เลขท้าย 3 ตัว',     short: 'ท้าย3',   digits: 3, prizes: 1 },
    { key: 'last2',   label: 'เลขท้าย 2 ตัว',     short: 'ท้าย2',   digits: 2, prizes: 1 },
  ],
};

// หวยลาวพัฒนา (ค่ำ/เช้า) — เลข 4 ตัว + 3 ตัวบน + 2 ตัวล่าง
const LAD = {
  hero: 'main',
  fields: [
    { key: 'main',    label: 'เลขหลัก',          short: 'หลัก',   digits: 6, optional: true },
    { key: 'num4',    label: 'เลข 4 ตัว',         short: '4ตัว',    digits: 4, prizes: 1 },
    { key: 'top3',    label: 'เลข 3 ตัวบน',       short: '3บน',    digits: 3, prizes: 1 },
    { key: 'bottom2', label: 'เลข 2 ตัวล่าง',     short: '2ล่าง',  digits: 2, prizes: 1 },
  ],
};

const HN = {
  hero: 'main',
  fields: [
    { key: 'main',    label: 'เลขหลัก',          short: 'หลัก',   digits: 6, optional: true },
    { key: 'num4',    label: 'เลข 4 ตัว',         short: '4ตัว',    digits: 4, prizes: 1 },
    { key: 'top3',    label: 'เลข 3 ตัวบน',       short: '3บน',    digits: 3, prizes: 1 },
    { key: 'top2',    label: 'เลข 2 ตัวบน',       short: '2บน',    digits: 2, prizes: 1 },
    { key: 'bottom2', label: 'เลข 2 ตัวล่าง',     short: '2ล่าง',  digits: 2, prizes: 1 },
  ],
};

// เฉพาะหมวด LA ที่เป็นหวยลาวพัฒนาใช้ schema ต่างจากหวยลาวทั่วไป
const BY_CATEGORY = { 'LA:LAD': LAD, 'LA:LADAM': LAD };
const BY_TYPE = { TH, LA, HN };

export function resultSchema(typeCode, categoryCode) {
  return BY_CATEGORY[`${typeCode}:${categoryCode}`] || BY_TYPE[typeCode] || null;
}

// ป้ายกำกับภาษาไทยของ bet_type สำหรับหน้าผล/ประวัติโพย
export const BET_TYPE_LABELS = {
  first: 'รางวัลที่ 1', front3: 'เลขหน้า 3 ตัว', top3: 'เลขท้าย 3 ตัวบน',
  bottom2: 'เลขท้าย 2 ตัว', last4: 'เลขท้าย 4 ตัว', last3: 'เลขท้าย 3 ตัว',
  last2: 'เลขท้าย 2 ตัว', num4: 'เลข 4 ตัว', top2: 'เลข 2 ตัวบน',
  // legacy (โพยเก่าก่อนปรับโครงสร้าง)
  '2top': '2 ตัวบน', '2bottom': '2 ตัวล่าง', '3top': '3 ตัวบน',
  '3tod': '3 ตัวโต๊ด', 'run_top': 'เลขวิ่งบน', 'run_bottom': 'เลขวิ่งล่าง',
  pattana5: 'สลากพัฒนา 5/45',
};
