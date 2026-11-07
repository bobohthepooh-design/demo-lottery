import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Results() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/lottery/results').then(r => setResults(r.results)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">ผลรางวัล</h1>
      <div className="bg-navy-800 border border-navy-700 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-navy-900 text-navy-300 text-xs">
            <tr><th className="text-left px-4 py-3">ประเภทหวย</th><th className="text-left px-4 py-3">รอบ</th><th className="text-left px-4 py-3">ผลรางวัล</th><th className="text-left px-4 py-3">เวลาออกผล</th></tr>
          </thead>
          <tbody className="divide-y divide-navy-700">
            {results.map(r => (
              <tr key={r.id} className="hover:bg-navy-700/40">
                <td className="px-4 py-3 text-white">{r.type_name_th}</td>
                <td className="px-4 py-3 text-navy-300">{r.draw_code}<div className="text-xs">{r.draw_at}</div></td>
                <td className="px-4 py-3"><code className="text-gold-300 font-mono">{r.winning_numbers}</code></td>
                <td className="px-4 py-3 text-xs text-navy-300">{r.published_at}</td>
              </tr>
            ))}
            {!loading && !results.length && <tr><td colSpan="4" className="px-4 py-8 text-center text-navy-400">ยังไม่มีผลรางวัล</td></tr>}
            {loading && <tr><td colSpan="4" className="px-4 py-8 text-center text-navy-400">กำลังโหลด...</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
