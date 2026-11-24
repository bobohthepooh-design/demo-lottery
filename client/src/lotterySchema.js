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
    { key: 'last3',    label: 'เลขท้าย 3 ตัว',     short: 'ท้าย3',   digits: 3, prizes: 2 },
    { key: 'bottom2',  label: 'เลขท้าย 2 ตัว',     short: 'ท้าย2',   digits: 2, prizes: 1 },
    // เลขบน/วิ่ง derive จากรางวัลที่ 1 อัตโนมัติ — ไม่ต้องกรอก (แสดงผลเท่านั้น)
    { key: 'top4',     label: 'สี่ตัวบน',          short: '4บน',    digits: 4, optional: true },
    { key: 'top3',     label: 'สามตัวบน',          short: '3บน',    digits: 3, optional: true },
    { key: 'top2',     label: 'สองตัวบน',         short: '2บน',    digits: 2, optional: true },
    { key: 'last1',    label: 'วิ่งบน',            short: 'วิ่งบน',  digits: 1, optional: true },
    { key: 'bottom1', label: 'วิ่งล่าง',           short: 'วิ่งล่าง', digits: 1, optional: true },
  ],
};

// หวยลาว/ฮานอย/ลาวพัฒนา — ทุกประเภทแทงเป็นตัวท้ายของเลขรางวัลหลัก (6 หลัก)
// กรอกแค่ 'main' — last5..last1/bottom2/bottom1 derive อัตโนมัติฝั่ง server (optional = override ได้)
const LAHN = {
  hero: 'main',
  fields: [
    { key: 'main',    label: 'เลขรางวัลหลัก',   short: 'หลัก',   digits: 6, prizes: 1 },
    { key: 'last5',   label: 'เลขท้าย 5 ตัว',   short: '5ตัว',   digits: 5, prizes: 1, optional: true },
    { key: 'last4',   label: 'สี่ตัวบน',         short: '4บน',   digits: 4, prizes: 1, optional: true },
    { key: 'last3',   label: 'สามตัวบน',         short: '3บน',   digits: 3, prizes: 1, optional: true },
    { key: 'last2',   label: 'สองตัวบน',         short: '2บน',   digits: 2, prizes: 1, optional: true },
    { key: 'bottom2', label: 'สองตัวล่าง',       short: '2ล่าง', digits: 2, prizes: 1, optional: true },
    { key: 'last1',   label: 'วิ่งบน',            short: 'วิ่งบน', digits: 1, optional: true },
    { key: 'bottom1', label: 'วิ่งล่าง',          short: 'วิ่งล่าง', digits: 1, optional: true },
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
    { key: 'last4',  label: 'เลขท้าย 4 ตัว',   short: 'ท้าย4', digits: 4, prizes: 1, optional: true },
    { key: 'last3',  label: 'เลขท้าย 3 ตัว',   short: 'ท้าย3', digits: 3, prizes: 1, optional: true },
    // เลขบน/ล่าง derive จากอันดับ 1/5 อัตโนมัติ — ไม่ต้องกรอก (แสดงผลเท่านั้น)
    { key: 'top4',   label: 'สี่ตัวบน',          short: '4บน',  digits: 4, optional: true },
    { key: 'top3',   label: 'สามตัวบน',          short: '3บน',  digits: 3, optional: true },
    { key: 'top2',   label: 'สองตัวบน',         short: '2บน',  digits: 2, optional: true },
    { key: 'bottom2',label: 'สองตัวล่าง',       short: '2ล่าง', digits: 2, optional: true },
    { key: 'last1',  label: 'วิ่งบน',            short: 'วิ่งบน', digits: 1, optional: true },
    { key: 'bottom1', label: 'วิ่งล่าง',          short: 'วิ่งล่าง', digits: 1, optional: true },
  ],
};

// เฉพาะหมวด LA ที่เป็นหวยลาวพัฒนาใช้ schema ต่างจากหวยลาวทั่วไป
const BY_CATEGORY = { 'LA:LAD': LAHN, 'LA:LADAM': LAHN };
const BY_TYPE = { TH, LA: LAHN, HN: LAHN, HR, GS };

export function resultSchema(typeCode, categoryCode) {
  return BY_CATEGORY[`${typeCode}:${categoryCode}`] || BY_TYPE[typeCode] || null;
}

// ป้ายกำกับภาษาไทยของ bet_type สำหรับหน้าผล/ประวัติโพย
export const BET_TYPE_LABELS = {
  // ลิสต์ใหม่ (ไทย/ออมสิน/ลาว/ฮานอย)
  top4: 'สี่ตัวบน', '3top': 'สามตัวบน', '3tod': 'สามตัวโต๊ด',
  front3: 'สามตัวหน้า', top3: 'สามตัวท้าย',
  '2top': 'สองตัวบน', bottom2: 'สองตัวล่าง',
  run_top: 'วิ่งบน', run_bottom: 'วิ่งล่าง',
  // legacy (โพยเก่าก่อนปรับโครงสร้าง)
  first: 'รางวัลที่ 1', '2bottom': '2 ตัวล่าง',
  last4: 'เลขท้าย 4 ตัว', last3: 'เลขท้าย 3 ตัว', last2: 'เลขท้าย 2 ตัว',
  num1: 'เลข 1 ตัว', num2: 'เลข 2 ตัว', num3: 'เลข 3 ตัว', num4: 'เลข 4 ตัว', num5: 'เลข 5 ตัว',
  'front3tod': 'เลขหน้า 3 ตัวโต๊ด', 'top2tod': 'เลข 2 ตัวบนโต๊ด', 'bottom2tod': 'เลข 2 ตัวล่างโต๊ด',
  pattana5: 'สลากพัฒนา 5/45',
  scratch: 'สล็อต 5 รีล 20 เพย์ไลน์',
  hilo: 'ไฮโลเต๋า',
  kiwi: 'ยี่กี', kiwi_vip: 'ยี่กี VIP', kiwi_zodiac: 'ยี่กีราศี', kiwi_animal: 'ยี่กีสัตว์', kiwi_dice: 'น้ำเต้าปูปลา',
  zodiac: 'รางวัลใหญ่ (ปีนักษัตรตัวแรก)',
  zodiac3top: '3 ปีนักษัตรบน (3 ตัวท้าย)',
  zodiac2bottom: '2 ปีนักษัตรล่าง (2 ตัวท้าย)',
  zodiac_run: 'วิ่งปีนักษัตร (อยู่ในผลก็ถูก)',
};
