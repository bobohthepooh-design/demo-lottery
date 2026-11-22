// StatCard — การ์ดตัวเลขสรุป (ยอดเงิน/สถิติ) มาตรฐานเดียวทั้งเว็บ
export default function StatCard({ label, value, sub, accent = 'text-gold-300', className = '' }) {
  return (
    <div className={`bg-gradient-to-b from-navy-800 to-navy-900 border border-navy-600/70 rounded-xl px-4 py-3 text-center shadow-md shadow-black/15 ${className}`}>
      <div className="text-[12px] text-navy-400">{label}</div>
      <div className={`text-lg font-bold ${accent}`}>{value}</div>
      {sub && <div className="text-[11px] text-navy-400 mt-0.5">{sub}</div>}
    </div>
  );
}
