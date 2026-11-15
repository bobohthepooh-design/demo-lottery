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
  if (source.includes('gen')) return { label: '🎲 DEMO', cls: 'bg-purple-500/15 text-purple-300', short: '🎲 DEMO' };
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
