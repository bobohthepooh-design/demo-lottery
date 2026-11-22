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
    { key: 'last3',   label: 'เลข 3 ตัว',         short: '3ตัว',    digits: 3, prizes: 1 },
    { key: 'last2',   label: 'เลข 2 ตัวบน',       short: '2บน',    digits: 2, prizes: 1 },
    { key: 'bottom2', label: 'เลข 2 ตัวล่าง',     short: '2ล่าง',  digits: 2, prizes: 1 },
  ],
};

// หวยลาวพัฒนา (ค่ำ/เช้า) — เลข 4 ตัว + 3 ตัวบน + 2 ตัวล่าง
const LAD = {
  hero: 'main',
  fields: [
    { key: 'main',    label: 'เลขหลัก',          short: 'หลัก',   digits: 6, optional: true },
    { key: 'num4',    label: 'เลข 4 ตัว',         short: '4ตัว',    digits: 4, prizes: 1 },
    { key: 'top3',    label: 'เลข 3 ตัวบน',       short: '3บน',    digits: 3, prizes: 1 },
    { key: 'last2',   label: 'เลข 2 ตัวบน',       short: '2บน',    digits: 2, prizes: 1 },
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

// หวยรายชั่วโมง — ผลเป็นปีนักษัตรไทย 1 ใน 12 (field zodiac = ข้อความ ไม่ใช่ตัวเลข)
const HR = {
  hero: 'zodiac',
  fields: [
    { key: 'zodiac', label: 'ปีนักษัตรรางวัลใหญ่ (ตัวแรก)', short: 'รางวัลใหญ่', zodiac: true },
    { key: 'seq',    label: 'เลขรางวัล 6 ปีนักษัตร (คั่นด้วย -)', short: 'ผล 6 ตัว', seq: true },
  ],
};

// สลากออมสิน (GS) — อันดับ 1-5 (7 หลัก) + เลขท้าย 4/3 ตัว
// อ.3 มี 5 เลข, อ.4 มี 10 เลข, อ.5 มี 15 เลข (เก็บเป็น array)
const GS = {
  hero: 'p1',
  fields: [
    { key: 'p1',     label: 'รางวัลอันดับ 1',  short: 'อ.1',  digits: 7, prizes: 1, hero: true },
    { key: 'p2',     label: 'รางวัลอันดับ 2',  short: 'อ.2',  digits: 7, prizes: 1 },
    { key: 'p3',     label: 'รางวัลอันดับ 3',  short: 'อ.3',  digits: 7, prizes: 5 },
    { key: 'p4',     label: 'รางวัลอันดับ 4',  short: 'อ.4',  digits: 7, prizes: 10 },
    { key: 'p5',     label: 'รางวัลอันดับ 5',  short: 'อ.5',  digits: 7, prizes: 15 },
    { key: 'last4',  label: 'เลขท้าย 4 ตัว',   short: 'ท้าย4', digits: 4, prizes: 1 },
    { key: 'last3',  label: 'เลขท้าย 3 ตัว',   short: 'ท้าย3', digits: 3, prizes: 1 },
  ],
};

// เฉพาะหมวด LA ที่เป็นหวยลาวพัฒนาใช้ schema ต่างจากหวยลาวทั่วไป
const BY_CATEGORY = { 'LA:LAD': LAD, 'LA:LADAM': LAD };
const BY_TYPE = { TH, LA, HN, HR, GS };

export function resultSchema(typeCode, categoryCode) {
  return BY_CATEGORY[`${typeCode}:${categoryCode}`] || BY_TYPE[typeCode] || null;
}

// ป้ายกำกับภาษาไทยของ bet_type สำหรับหน้าผล/ประวัติโพย
export const BET_TYPE_LABELS = {
  first: 'รางวัลที่ 1', front3: 'เลขหน้า 3 ตัว', top3: 'เลขท้าย 3 ตัวบน',
  bottom2: 'เลขท้าย 2 ตัว', last4: 'เลขท้าย 4 ตัว', last3: 'เลขท้าย 3 ตัว',
  last2: 'เลขท้าย 2 ตัว', num4: 'เลข 4 ตัว', top2: 'เลข 2 ตัวบน',
  // legacy (โพยเก่าก่อนปรับโครงสร้าง)
  '2top': '2 ตัวบน', '2bottom': '2 ตัวล่าง', '3top': '3 ตัวบน', 'top4': '4 ตัวบน',
  '3tod': '3 ตัวโต๊ด', 'front3tod': 'เลขหน้า 3 ตัวโต๊ด', 'top2tod': 'เลข 2 ตัวบนโต๊ด', 'bottom2tod': 'เลข 2 ตัวล่างโต๊ด',
  'run_top': 'เลขวิ่งบน', 'run_bottom': 'เลขวิ่งล่าง',
  pattana5: 'สลากพัฒนา 5/45',
  scratch: 'สล็อต 5 รีล 20 เพย์ไลน์',
  hilo: 'ไฮโลเต๋า',
  kiwi: 'ยี่กี', kiwi_vip: 'ยี่กี VIP', kiwi_zodiac: 'ยี่กีราศี', kiwi_animal: 'ยี่กีสัตว์', kiwi_dice: 'น้ำเต้าปูปลา',
  zodiac: 'รางวัลใหญ่ (ปีนักษัตรตัวแรก)',
  zodiac3top: '3 ปีนักษัตรบน (3 ตัวท้าย)',
  zodiac2bottom: '2 ปีนักษัตรล่าง (2 ตัวท้าย)',
  zodiac_run: 'วิ่งปีนักษัตร (อยู่ในผลก็ถูก)',
};
