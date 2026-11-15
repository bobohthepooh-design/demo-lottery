/** ตารางสัญลักษณ์ 3x3 — ใช้แสดงผลย้อนหลัง/บัตรเก่า (เกมปัจจุบันใช้ SlotMachine แทน) */
export function SymbolGrid({ grid, className = '' }) {
  return (
    <div className={`grid grid-cols-3 gap-1.5 p-2 bg-navy-900 rounded-2xl border border-gold-500/40 ${className}`}>
      {grid.map((s, i) => (
        <div key={i} className="aspect-square flex items-center justify-center text-2xl sm:text-3xl bg-gradient-to-br from-navy-800 to-navy-950 rounded-xl border border-navy-700">
          {s}
        </div>
      ))}
    </div>
  );
}
