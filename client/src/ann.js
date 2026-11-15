// เลขอั้น — announce JSON ของ draw: { top, bottom }
// แต่ละด้านรับได้หลายรูปแบบ: '123' | ['123','456'] | [{num:'123',mult:400}] | '123:400, 456'
// mult = อัตราจ่ายเฉพาะรายเลข (คูณ stake) — ไม่ระบุ = ใช้อัตรากติกา ann_* (default ครึ่งรางวัลหลัก)

export function annList(ann, side) {
  const raw = ann?.[side];
  const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  const out = [];
  for (const e of list) {
    if (e && typeof e === 'object') {
      const num = String(e.num ?? e.number ?? '').trim();
      const mult = e.mult ?? e.payout ?? e.multiplier ?? null;
      if (num) out.push({ num, mult: mult == null ? null : Number(mult) });
    } else {
      const s = String(e).trim();
      const m = s.match(/^(\d+)\s*:\s*(\d+(?:\.\d+)?)$/);
      if (m) out.push({ num: m[1], mult: Number(m[2]) });
      else if (s) out.push({ num: s, mult: null });
    }
  }
  return [...new Map(out.map(e => [e.num, e])).values()].slice(0, 20);
}

export function annEntries(announce) {
  try {
    const ann = announce ? JSON.parse(announce) : null;
    if (!ann) return { top: [], bottom: [] };
    return { top: annList(ann, 'top'), bottom: annList(ann, 'bottom') };
  } catch { return { top: [], bottom: [] }; }
}

// ข้อความสรุปสำหรับ badge: "บน 123×400, 456 • ล่าง 45×50"
export function annSummary(announce) {
  const { top, bottom } = annEntries(announce);
  if (!top.length && !bottom.length) return null;
  const fmt = (list) => list.map(e => e.mult ? `${e.num}×${e.mult}` : e.num).join(', ');
  return `${top.length ? `บน ${fmt(top)}` : ''}${top.length && bottom.length ? ' • ' : ''}${bottom.length ? `ล่าง ${fmt(bottom)}` : ''}`;
}

// แปลง announce → text สำหรับช่องกรอก admin: "123:400, 456" (mult เว้นว่าง = default)
export function annToInput(announce, side) {
  return annEntries(announce)[side].map(e => e.mult ? `${e.num}:${e.mult}` : e.num).join(', ');
}

// parse text admin → [{num, mult?}] — คั่นด้วย , หรือขึ้นบรรทัดใหม่, mult ตามหลังด้วย :
export function parseAnnInput(text, digits) {
  return String(text || '')
    .split(/[,，;；\n]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(part => {
      const m = part.match(/^(\d+)\s*:\s*(\d+(?:\.\d+)?)$/);
      if (m) return { num: m[1], mult: Math.floor(Number(m[2])) };
      return { num: part.replace(/\D/g, '') };
    })
    .filter(e => e.num && (!digits || e.num.length === digits))
    .slice(0, 20);
}
