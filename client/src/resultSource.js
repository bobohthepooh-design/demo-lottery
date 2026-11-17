// แปลง lottery_results.source เป็น badge แสดงที่มาของผลรางวัล
//   manual          → ✏️ กรอกเอง (admin กรอก)
//   *gen* / *dev-gen* → 🎲 DEMO (ระบบสุ่มจำลอง)
//   อื่นๆ            → 🌐 เว็บจริง (ดึงจากแหล่งข้อมูลภายนอก เช่น GLO/XSMB/laodl/lotterychecks)
const SITE_NAME = {
  GLO: 'glo.or.th', XSMB: 'xsmb', laodl: 'laodl.com',
  'hanoi-adhoc': 'lotterychecks', 'hanoi-special': 'lotterychecks', 'hanoi-vip': 'lotterychecks',
};

export function sourceBadge(source) {
  if (!source) return null;
  if (source === 'manual') return { label: '✏️ กรอกเอง', cls: 'bg-amber-500/15 text-amber-300', short: '✏️ กรอกเอง' };
  if (source === 'demo' || source.includes('gen')) return { label: '🎲 DEMO', cls: 'bg-purple-500/15 text-purple-300', short: '🎲 DEMO' };
  if (source === 'auto') return { label: '🤖 อัตโนมัติ', cls: 'bg-emerald-500/15 text-emerald-300', short: '🤖 อัตโนมัติ' };
  const inner = source.match(/\(([^)]+)\)/)?.[1] || source;
  const site = SITE_NAME[inner] || inner;
  return { label: `🌐 ${site}`, cls: 'bg-emerald-500/15 text-emerald-300', short: `🌐 ${site}` };
}

// badge สำหรับรอบที่ยังไม่ออกผล — ทำนายประเภทผลจาก result_kind ของ draw
export function kindBadge(kind) {
  if (kind === 'manual') return { label: '✏️ ผลกรอกเอง', cls: 'bg-amber-500/15 text-amber-300', short: '✏️ กรอกเอง' };
  if (kind === 'demo') return { label: '🎲 ผล DEMO', cls: 'bg-purple-500/15 text-purple-300', short: '🎲 DEMO' };
  return { label: '🌐 ผลจริง (เว็บ)', cls: 'bg-emerald-500/15 text-emerald-300', short: '🌐 เว็บจริง' };
}

// ---------- ข้อมูลตลาด: ชนิด + แหล่งผลจริง (ตรวจสอบแล้วจากแหล่งข้อมูลภายนอก) ----------
// mode: auto=ดึงผลจริงอัตโนมัติ, manual=ผลจริงแต่ admin กรอกเอง, game=เกมในระบบ, demo=สุ่มในระบบ, off=ปิด
export const MARKET_INFO = {
  TH:          { kind: 'หวยจริง',    mode: 'auto',   official: true, src: 'GLO (glo.or.th)' },
  LA:          { kind: 'หวยจริง',    mode: 'auto',   official: false, src: 'lotterychecks (lao-union)' },
  'LA:LAD':    { kind: 'หวยจริง',    mode: 'manual', src: 'admin กรอกผลจริง' },
  'LA:LADAM':  { kind: 'หวยจริง',    mode: 'auto',   official: false, src: 'lotterychecks (lao-dev-morning)' },
  'LA:LAM':    { kind: 'หวยจริง',    mode: 'auto',   official: false, src: 'lotterychecks (lao-morning)' },
  'LA:LADT':   { kind: 'หวยจริง',    mode: 'auto',   official: false, src: 'lotterychecks (lao-dev-midday)' },
  HN:          { kind: 'หวยจริง',    mode: 'auto',   official: false, src: 'XSMB / lotterychecks' },
  'HN:HNN':    { kind: 'หวยจริง',    mode: 'auto',   official: false, src: 'XSMB' },
  'HN:HNST':   { kind: 'หวยจริง',    mode: 'auto',   official: false, src: 'XSMB' },
  'HN:HNM':    { kind: 'หวยจริง',    mode: 'auto',   official: false, src: 'lotterychecks (hanoi-morning)' },
  'HN:HNS':    { kind: 'หวยจริง',    mode: 'auto',   official: false, src: 'lotterychecks.com' },
  'HN:HNP':    { kind: 'หวยจริง',    mode: 'auto',   official: false, src: 'lotterychecks.com' },
  'HN:HNV':    { kind: 'หวยจริง',    mode: 'auto',   official: false, src: 'lotterychecks.com' },
  GS:          { kind: 'หวยจริง',    mode: 'auto',   official: false, src: 'lotterychecks (gsb-lottery)' },
  HR:          { kind: 'เกมจับราษี', mode: 'demo',   src: 'สุ่มในระบบ' },
  SC:          { kind: 'เกมด่วน',    mode: 'game',   src: 'ในระบบ' },
  HL:          { kind: 'เกมด่วน',    mode: 'game',   src: 'ในระบบ' },
  KI:          { kind: 'เกมด่วน',    mode: 'game',   src: 'ในระบบ' },
};
export const MODE_BADGE = {
  auto:   { label: '🌐 ผลจริงอัตโนมัติ', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  manual: { label: '✏️ ผลจริง — admin กรอก', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  game:   { label: '🎮 เกม (ผลในระบบ)', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  demo:   { label: '🎲 สุ่มในระบบ', cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  off:    { label: '⛔ ไม่มีจริง — ปิด', cls: 'bg-navy-700 text-navy-400 border-navy-600' },
};
export function marketInfo(typeCode, catCode) {
  return MARKET_INFO[`${typeCode}:${catCode}`] || MARKET_INFO[typeCode] || null;
}

// true เฉพาะตลาดที่ผลมาจากแหล่งทางการ (ตอนนี้มีแค่หวยไทยผ่าน GLO)
export function isOfficial(mi) { return !!(mi && mi.official); }
