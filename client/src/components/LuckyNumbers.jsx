import { useEffect, useState } from 'react';
import { api, fmtDate } from '../api.js';
import { FlagIcon } from './ResultLine.jsx';

const COLLAPSED_COUNT = 4; // แสดงตลาดเด่น 4 อันก่อน ที่เหลือกดขยาย — กันหน้าแรกยาวเกิน

// การ์ดเลขเด็ด/เลขดัง — สถิติความถี่จากผลรางวัลจริง (lotterychecks.com)
// แสดงเป็น "เลขที่ออกบ่อย" ไม่ใช่การันตี — มีข้อความเตือนเสมอ
export default function LuckyNumbers() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    api('/lottery/lucky').then(setData).catch(e => setErr(e.message));
  }, []);

  if (err) return null; // ซ่อนเงียบๆ ถ้าแหล่งข้อมูลล่ม — ไม่ให้หน้าพัง
  if (!data) return (
    <section>
      <div className="bg-navy-800/60 border border-navy-700/60 rounded-2xl p-5 animate-pulse">
        <div className="h-4 w-40 bg-navy-700 rounded mb-3" />
        <div className="h-16 bg-navy-700/60 rounded" />
      </div>
    </section>
  );

  return (
    <section>
      <div className="flex items-end justify-between mb-4 flex-wrap gap-2">
        <div>
          <div className="kicker mb-1">Hot Numbers</div>
          <h2 className="text-xl font-bold text-white">เลขเด็ด / เลขดัง</h2>
          <p className="text-xs text-navy-400 mt-0.5">
            เลขที่ออกบ่อยจากสถิติผลจริง {data.draws ? `(${data.draws.toLocaleString()} งวด)` : ''}
            {data.markets?.[0]?.updatedAt ? ` • ข้อมูลถึง ${fmtDate(data.markets[0].updatedAt)}` : ''}
          </p>
        </div>
        <a href="https://lotterychecks.com/statistics" target="_blank" rel="noreferrer"
          className="text-xs text-navy-400 hover:text-gold-300 transition">แหล่งข้อมูล: lotterychecks.com ↗</a>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {(expanded ? data.markets : data.markets.slice(0, COLLAPSED_COUNT)).map(m => (
          <div key={m.key} className="bg-navy-800/70 border border-navy-700/60 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <FlagIcon code={m.key} className="w-7 h-5 text-[9px]" />
              <span className="font-bold text-navy-950">{m.name_th}</span>
              <span className="ml-auto text-[9px] text-navy-500">สถิติย้อนหลัง</span>
            </div>
            <div className="space-y-2">
              {m.prizes.map(p => (
                <div key={p.prize} className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-navy-400 w-20 shrink-0">{p.prizeName}</span>
                  <div className="flex gap-1 flex-wrap">
                    {p.numbers.map((n, i) => (
                      <span key={n.number}
                        className={`px-2 py-0.5 rounded font-mono text-xs font-bold border ${i === 0
                          ? 'bg-gold-500/20 border-gold-500/50 text-gold-300'
                          : 'bg-navy-900 border-navy-600 text-navy-200'}`}>
                        {n.number}
                        <span className="text-[8px] text-navy-500 font-normal ml-1">x{n.count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {data.markets.length > COLLAPSED_COUNT && (
        <button onClick={() => setExpanded(v => !v)}
          className="mt-3 w-full py-2.5 rounded-xl border border-navy-600 text-navy-200 text-sm font-semibold hover:border-gold-500/50 hover:text-gold-300 transition">
          {expanded ? '▾ ย่อรายการ' : `▸ แสดงตลาดทั้งหมดอีก ${data.markets.length - COLLAPSED_COUNT} ตลาด`}
        </button>
      )}

      <p className="text-[10px] text-navy-500 mt-3 text-center">
        ⚠️ เลขเด่นเป็นสถิติจากผลรางวัลย้อนหลัง ไม่ใช่การันตีผล — ใช้เพื่อการศึกษาเท่านั้น
      </p>
    </section>
  );
}
