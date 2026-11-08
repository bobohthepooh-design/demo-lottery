import { Link } from 'react-router-dom';

// Empty state สวยงาม — icon + ข้อความ + ปุ่ม CTA
export default function EmptyState({ emoji = '📭', title, hint, to, cta }) {
  return (
    <div className="bg-navy-800/60 border border-dashed border-navy-600 rounded-xl py-12 px-6 text-center">
      <div className="text-5xl mb-3 animate-float">{emoji}</div>
      <div className="text-white font-semibold">{title}</div>
      {hint && <div className="text-sm text-navy-300 mt-1">{hint}</div>}
      {to && cta && (
        <Link to={to} className="inline-block mt-4 bg-gold-500 text-navy-950 font-bold px-6 py-2.5 rounded-lg hover:bg-gold-400 text-sm">
          {cta}
        </Link>
      )}
    </div>
  );
}
