import { useEffect, useState } from 'react';
import { api, thaiDate, thaiTime } from '../api.js';
import { FlagIcon } from './ResultLine.jsx';
import { resultSchema } from '../lotterySchema.js';
import { sourceBadge } from '../resultSource.js';

// แถว ticker ผลรางวัล — เลขเด่นๆ จาก schema
function tickerText(r) {
  let data = r.winning_numbers;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { data = {}; } }
  const schema = resultSchema(r.type_code, r.category_code);
  const fields = (schema?.fields || []).filter(f => !f.optional && f.key !== 'main');
  const parts = fields.map(f => {
    const v = data?.[f.key];
    const vals = Array.isArray(v) ? v.join(', ') : v;
    return vals ? `${f.short || f.label} ${vals}` : null;
  }).filter(Boolean);
  const upd = r.published_at ? ` • อัปเดต ${thaiDate(r.published_at)} ${thaiTime(r.published_at)} น.` : '';
  const b = sourceBadge(r.source);
  const src = b ? ` • ${b.short}` : '';
  return `${r.category_name_th || r.type_name_th}: ${parts.join(' • ') || '—'}${src}${upd}`;
}

// เกมด่วน/ราศี — มี ResultPopup เด้งอยู่แล้ว ไม่ต้องมาแย่ง ticker
const INSTANT = new Set(['SC', 'HL', 'KI', 'CF', 'HR']);

// Ticker ผลรางวัลล่าสุด — แสดงใต้แถบประกาศทุกหน้า (เฉพาะหวยแทง 4 ผลล่าสุด)
export default function ResultsTicker() {
  const [rawResults, setRawResults] = useState([]);
  const [lastSync, setLastSync] = useState(null);
  const [live, setLive] = useState(true); // SSE connection status

  useEffect(() => {
    const load = () => api('/lottery/results').then(r => {
      setRawResults(r.results);
      setLastSync(new Date());
    }).catch(() => {});
    load();
    const t = setInterval(load, 30000); // ผลรางวัลออกใหม่ทุกชั่วโมง — refresh อัตโนมัติทุก 30 วิ
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', load);
    const onLive = (e) => setLive(!!e.detail?.live);
    window.addEventListener('sys:live', onLive);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', load);
      window.removeEventListener('sys:live', onLive);
    };
  }, []);

  // SSE — ผลรางวัลออกปุ๊บอัปเดตทันที
  useEffect(() => {
    const h = () => api('/lottery/results').then(r => {
      setRawResults(r.results);
      setLastSync(new Date());
    }).catch(() => {});
    window.addEventListener('sys:update', h);
    return () => window.removeEventListener('sys:update', h);
  }, []);

  // เฉพาะผลหวยแทง (ไม่เอาเกมด่วน/ราศี) 4 อันล่าสุด
  const results = rawResults.filter(r => !INSTANT.has(r.type_code)).slice(0, 4);
  if (!results.length) return null;
  const syncStr = lastSync
    ? `${String(lastSync.getHours()).padStart(2, '0')}:${String(lastSync.getMinutes()).padStart(2, '0')}:${String(lastSync.getSeconds()).padStart(2, '0')}`
    : '—';

  return (
    <div className="max-w-7xl w-full mx-auto px-4 pt-3">
      <div className="ticker-led ticker-scan rounded-xl overflow-hidden border">
        <div className="flex items-center gap-2 px-4 py-1.5 bg-black/60 border-b border-gold-500/25">
          <span className="text-xs font-bold text-gold-300">📢 ผลรางวัลล่าสุด</span>
          <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${live ? 'bg-green-500/15 text-green-300 border border-green-500/30' : 'bg-navy-700/30 text-navy-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-green-500 animate-pulse' : 'bg-navy-400'}`} />
            {live ? 'อัปเดตอัตโนมัติ' : 'ออฟไลน์'}
          </span>
          <span className="text-[10px] text-navy-400">ซิงก์ {syncStr} น. • ชี้เพื่อหยุดเลื่อน</span>
        </div>
        <div className="overflow-hidden py-1.5">
          <div className="flex w-max animate-marquee-xfast gap-8 px-4">
            {[...results, ...results].map((r, i) => (
              <span key={i} className="ticker-item text-xs whitespace-nowrap flex items-center gap-1.5">
                <FlagIcon code={r.type_code} className="w-5 h-5 text-[9px]" />
                {tickerText(r)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
