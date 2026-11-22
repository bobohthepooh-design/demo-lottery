// StatCard — การ์ดตัวเลขสรุป (ยอดเงิน/สถิติ) มาตรฐานเดียวทั้งเว็บ
export default function StatCard({ label, value, sub, accent = 'text-gold-300', className = '' }) {
  return (
    <div className={`bg-gradient-to-b from-navy-800 to-navy-900 border border-navy-700/60 rounded-xl px-4 py-3 text-center shadow-md shadow-black/20 ${className}`}>
      <div className="text-xs text-navy-400 font-medium">{label}</div>
      <div className={`text-xl font-bold ${accent}`}>{value}</div>
      {sub && <div className="text-xs text-navy-400 mt-0.5">{sub}</div>}
    </div>
  );
}
