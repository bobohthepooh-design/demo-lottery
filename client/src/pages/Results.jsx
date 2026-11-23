import { useEffect, useState } from 'react';
import { api, fmtDateTime, thaiDate, thaiTime } from '../api.js';
import { useAuth } from '../auth.jsx';
import { FlagIcon } from '../components/ResultLine.jsx';
import CheckNumbers from '../components/CheckNumbers.jsx';
import { sourceBadge } from '../resultSource.js';
import { asList, resultSummary, compactSummary, heroNumbers } from '../resultFields.js';
import { typeAccent } from '../typeAccent.js';
import { toast } from '../components/toast.js';
import { satang } from '../api.js';
import EmptyState from '../components/EmptyState.jsx';

const STATUS_TH = {
  scheduled: 'กำหนดการ', open: 'เปิดรับแทง', closed: 'ปิดรับแล้ว รอผล',
  settled: 'ออกผลแล้ว', cancelled: 'ยกเลิก',
};

function summarizeWinning(w) {
  if (!w) return '—';
  const parts = [];
  if (w.first || w.p1) parts.push(Array.isArray(w.p1) ? w.p1[0] : (w.first ?? w.p1));
  if (w.main) parts.push(w.main);
  if (w.num4) parts.push(w.num4);
  if (w.top3) parts.push(asList(w.top3));
  if (w.last3) parts.push('ท้าย3:' + asList(w.last3));
  if (w.bottom2) parts.push('ล่าง:' + w.bottom2);
  if (w.zodiac) parts.push(w.zodiac);
  return parts.join(' · ') || JSON.stringify(w).slice(0, 60);
}

function marketKey(r) { return `${r.type_code}|${r.category_code || ''}`; }
function marketLabel(r) { return r.category_name_th || r.type_name_th; }

// วันที่ไทย YYYY-MM-DD — ใช้กับ ?date= ของ /lottery/today
const bkkTodayStr = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const parseDay = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const thaiShort = s => { const d = parseDay(s); return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }); };
const thaiFull = s => { const d = parseDay(s); return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }); };

export default function Results() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [latestResults, setLatestResults] = useState([]);
  const [cardOpen, setCardOpen] = useState({}); // การ์ดผลล่าสุด — ขยายดูผลทุกรางวัล
  const [err, setErr] = useState('');
  const [wonDraws, setWonDraws] = useState(() => new Set()); // draw_id ที่โพยของฉันมีรายการถูกรางวัล
  const [expanded, setExpanded] = useState({}); // draw_id -> bool: แสดงผลละเอียด
  const [date, setDate] = useState(bkkTodayStr);
  const [typeFilter, setTypeFilter] = useState(''); // '' = ทุกประเภท
  const [q, setQ] = useState('');                    // ค้นหารหัสรอบ/ชื่อรอบ

  const load = () => api(`/lottery/today?date=${date}`).then(setData).catch(e => setErr(e.message));
  // ล้างข้อมูลเดิมทุกครั้งที่เปลี่ยนวัน — กันผลของวันเก่าค้างแสดงจน fetch ใหม่กลับมา
  // + reset ตัวกรอง/ค้นหา — ไม่งั้นวันที่ใหม่ที่ไม่มีประเภทที่ filter อยู่จะดูเหมือนปุ่มใช้ไม่ได้
  useEffect(() => { setData(null); setErr(''); setTypeFilter(''); setQ(''); load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [date]);

  // ดึงโพยของฉันครั้งเดียว — mark รอบที่มีรายการถูกรางวัล เพื่อไฮไลต์ในตารางผล
  useEffect(() => {
    if (!user) { setWonDraws(new Set()); return; }
    api('/bets/mine?limit=100').then(r => {
      const s = new Set();
      for (const slip of r.slips || r.bets || []) {
        if ((slip.items || []).some(i => i.status === 'won')) s.add(slip.draw_id);
      }
      setWonDraws(s);
    }).catch(() => {});
  }, [user]);

  const isToday = date === bkkTodayStr();

  // ---- P3: history + stats ----
  const [markets, setMarkets] = useState([]);
  const [sel, setSel] = useState('');
  const [hist, setHist] = useState(null);
  const [stats, setStats] = useState(null);
  const [statLimit, setStatLimit] = useState(60);
  const [statErr, setStatErr] = useState('');
  const [winners, setWinners] = useState([]); // ผู้ชนะล่าสุด — กรองตามวันที่ฝั่ง client

  useEffect(() => {
    const loadLatestResults = () => api('/lottery/results').then(j => {
      setLatestResults(j.results || []);
      const ms = (j.results || []).map(r => ({ key: marketKey(r), type_code: r.type_code, category_code: r.category_code, label: marketLabel(r) }));
      setMarkets(ms);
      if (ms.length) setSel(current => current || ms[0].key);
    }).catch(e => setErr(e.message));
    loadLatestResults();
    const timer = setInterval(loadLatestResults, 60000);
    return () => clearInterval(timer);
  }, []);

  const loadStats = () => {
    const m = markets.find(x => x.key === sel);
    if (!m) return;
    setStatErr(''); setHist(null); setStats(null);
    const q = `type_code=${encodeURIComponent(m.type_code)}&limit=${statLimit}` + (m.category_code ? `&category_code=${encodeURIComponent(m.category_code)}` : '');
    api(`/lottery/history?${q}`).then(setHist).catch(e => setStatErr(e.message));
    api(`/lottery/stats?${q}`).then(setStats).catch(() => {});
  };
  useEffect(() => { if (sel) loadStats(); }, [sel, statLimit]);

  // ผู้ชนะล่าสุด — ดึงครั้งเดียว แล้วกรองตามวันที่ไทยที่เลือก (draw_at เก็บเป็น UTC → +7 ชม.)
  useEffect(() => {
    api('/lottery/winners?limit=50').then(r => setWinners(r.winners || [])).catch(() => {});
  }, []);
  const dayWinners = winners.filter(w => {
    const t = new Date(String(w.drawAt || '').replace(' ', 'T') + 'Z');
    return !isNaN(t) && fmtDay(new Date(t.getTime() + 7 * 3600e3)) === date;
  }).slice(0, 8);

  const draws = (data?.draws || []).filter(d => {
    if (!q.trim()) return true;
    const t = q.trim().toLowerCase();
    return [d.draw_code, d.type_name_th, d.cat_name_th, d.round_no != null ? `รอบ ${d.round_no}` : '']
      .filter(Boolean).some(v => String(v).toLowerCase().includes(t));
  });
  // settled/pending แสดงในตารางออกรางวัลอยู่แล้ว — ไม่ทำ section ซ้ำเพื่อไม่ให้หน้ารก

  // จัดกลุ่มตามตลาด (ประเภท+หมวด) — หัวกลุ่มแสดงตัวนับ ออกแล้ว X/Y เรียงตามรอบแรกของกลุ่ม
  const groups = [];
  {
    const m = new Map();
    for (const d of draws) {
      const k = marketKey(d);
      if (!m.has(k)) {
        const g = { key: k, label: marketLabel(d), type_code: d.type_code, items: [] };
        m.set(k, g); groups.push(g);
      }
      m.get(k).items.push(d);
    }
    groups.sort((a, b) => String(a.items[0].draw_at).localeCompare(String(b.items[0].draw_at)));
  }

  // tab กรองตามประเภทหวย — นับจำนวนรอบต่อประเภท
  const typeTabs = [];
  {
    const m = new Map();
    for (const d of draws) {
      if (!m.has(d.type_code)) m.set(d.type_code, { code: d.type_code, label: d.category_name_th || d.type_name_th, n: 0 });
      m.get(d.type_code).n += 1;
    }
    typeTabs.push(...m.values());
  }
  const visibleGroups = typeFilter ? groups.filter(g => g.type_code === typeFilter) : groups;

  const drawRow = (d) => {
    const ac = typeAccent(d.type_code);
    const badge = sourceBadge(d.result_source);
    const sum = resultSummary(d.winning);
    const compact = compactSummary(d.winning);
    const open = !!expanded[d.id];
    const sourceChecks = d.source_checks || [];
    const hasMismatch = sourceChecks.some(c => c.verification_status === 'mismatch');
    return (
      <div key={d.id} className="px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <FlagIcon code={d.type_code} className="w-5 h-5 text-[9px]" />
          <span className={`text-sm font-bold ${ac.text}`}>{d.category_name_th || d.type_name_th}</span>
          <span className="text-[11px] text-navy-400">{d.draw_code}</span>
          {badge && <span className={`text-[9px] px-1.5 py-0.5 rounded ${badge.cls}`}>{badge.short}</span>}
          {wonDraws.has(d.id) && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/25 border border-green-400/60 text-green-300 font-bold animate-pulse">🏆 โพยคุณถูก!</span>
          )}
          <span className="ml-auto text-[11px] text-navy-400">ออก {fmtDateTime(d.draw_at)}</span>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
            d.status === 'settled' ? 'bg-emerald-500/20 text-emerald-300'
            : d.status === 'open' ? 'bg-blue-500/20 text-blue-300'
            : d.status === 'closed' ? 'bg-amber-500/20 text-amber-300'
            : 'bg-navy-700 text-navy-300'}`}>
            {STATUS_TH[d.status] || d.status}
          </span>
        </div>
        {sourceChecks.length > 0 && (
          <div className={`mt-2 rounded-lg border px-3 py-2 text-[10px] ${hasMismatch ? 'border-amber-500/50 bg-amber-500/10 text-amber-200' : 'border-navy-700 bg-navy-900/50 text-navy-300'}`}>
            <div className="font-semibold">
              {hasMismatch
                ? `⚠️ แหล่งข้อมูลรายงานผลไม่ตรงกัน — ใช้ผลจาก ${d.result_source || 'แหล่งที่แสดงด้านบน'}`
                : 'ตรวจสอบแหล่งข้อมูล'}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {sourceChecks.map(c => {
                const role = c.source_role === 'official' ? 'ทางการ' : c.source_role === 'backup' ? 'สำรอง' : 'แหล่งหลัก';
                const status = {
                  matched: 'ตรงกัน', mismatch: 'ไม่ตรง', unverified: 'ยังไม่เทียบ',
                  unavailable: 'ดึงไม่สำเร็จ', date_mismatch: 'วันที่ไม่ตรง',
                }[c.verification_status] || c.verification_status;
                return (
                  <span key={c.source} title={c.error || `ตรวจเมื่อ ${c.checked_at || '-'}`}>
                    {role}:{' '}
                    <a href={c.source_url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-white">
                      {c.source}
                    </a>
                    {' '}· {status}
                    {c.winning && <span className="text-navy-400"> · {compactSummary(c.winning) || 'มีผลบันทึก'}</span>}
                  </span>
                );
              })}
            </div>
          </div>
        )}
        {d.status === 'settled' && d.winning && heroNumbers(d.winning).length > 0 && (
          <div className="announce-hero rounded-xl mt-2 px-4 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {heroNumbers(d.winning).map(h => (
                <div key={h.label} className="text-center">
                  <div className="text-[10px] text-navy-400 font-semibold tracking-wide">{h.label}</div>
                  <div className="announce-num text-xl sm:text-2xl leading-tight mt-0.5">{h.num}</div>
                </div>
              ))}
            </div>
            {sum && sum.length > 0 && (
              <button onClick={() => setExpanded(e => ({ ...e, [d.id]: !open }))}
                className="mt-2 w-full text-left text-[11px] text-navy-300 hover:text-white transition">
                {open ? '▾ ย่อผลทุกรางวัล' : '▸ ดูผลทุกรางวัล'}
              </button>
            )}
          </div>
        )}
        {!(d.status === 'settled' && d.winning && heroNumbers(d.winning).length > 0) && sum && sum.length > 0 && (
          <button onClick={() => setExpanded(e => ({ ...e, [d.id]: !open }))}
            className="mt-1.5 w-full text-left text-xs text-slate-100 bg-navy-900/80 hover:bg-navy-900 rounded-lg px-3 py-2 font-mono tabular-nums tracking-wide transition">
            {compact || sum[0]}
            {sum.length > 1 && (
              <span className="block text-[10px] text-navy-400 font-sans mt-0.5">
                {open ? '▾ ย่อรายละเอียด' : '▸ ดูผลทุกรางวัล'}
              </span>
            )}
          </button>
        )}
        {open && sum && (
          <div className="mt-1.5 text-xs text-slate-100 bg-navy-900/80 rounded-lg px-3 py-2 font-mono tabular-nums tracking-wide">
            {sum.map((p, i) => <div key={i}>{p}</div>)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-black text-white">ผลรางวัลและตารางออกรางวัล</h1>
        <p className="text-sm text-navy-400 mt-1">{thaiFull(date)} — อัปเดตอัตโนมัติทุก 60 วินาที</p>
        {/* เลือกวัน — วันนี้ + date picker (ปุ่มเมื่อวาน/พรุ่งนี้ถูกเอาออกตามที่ผู้ใช้แจ้ง) */}
        <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
          <button onClick={() => setDate(bkkTodayStr())} disabled={isToday}
            className={`text-xs rounded-lg px-3 py-1.5 font-bold transition ${isToday ? 'bg-gold-500/20 text-gold-300 border border-gold-500/40' : 'bg-navy-800 border border-navy-600 text-navy-200 hover:border-gold-500/50'}`}>
            วันนี้
          </button>
          <input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)}
            className="text-xs bg-navy-800 border border-navy-600 rounded-lg px-2 py-1.5 text-navy-200 [color-scheme:dark]" />
        </div>
      </div>

      {err && <div className="bg-red-500/10 border border-red-500/40 text-red-300 rounded-xl px-4 py-3 text-sm">{err}</div>}

      {/* ตรวจเลขด่วน — pattern จาก lotterychecks: ช่องตรวจรางวัลบนหน้าเดียว ไม่ต้องเปลี่ยนหน้า */}
      <CheckNumbers />

      {/* ผลล่าสุดทุกตลาด — แบบ lotterychecks: การ์ดแยกตามประเทศ (ไทย/ลาว/ฮานอย/ออมสิน/ราศี)
          ไม่ขึ้นกับวันที่เลือก — แสดงผลล่าสุดที่บันทึกแล้วของแต่ละตลาด */}
      {latestResults.length > 0 && (() => {
        const GROUP_ORDER = ['TH', 'LA', 'HN', 'GS', 'HR'];
        const GROUP_LABEL = { TH: 'ไทย', LA: 'ลาว', HN: 'ฮานอย', GS: 'ออมสิน', HR: 'ราศี' };
        const byType = new Map();
        for (const r of latestResults) {
          const k = r.type_code || '';
          if (!byType.has(k)) byType.set(k, []);
          byType.get(k).push(r);
        }
        const groups = [...byType.entries()].sort((a, b) => {
          const ia = GROUP_ORDER.indexOf(a[0]), ib = GROUP_ORDER.indexOf(b[0]);
          return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        });
        return (
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-bold text-white">🏆 ผลล่าสุดทุกตลาด</h2>
              <p className="text-[11px] text-navy-400 mt-0.5">ผลล่าสุดของแต่ละตลาด โดยไม่ขึ้นกับวันที่เลือกด้านบน</p>
            </div>
            {groups.map(([code, items]) => (
              <div key={code}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <FlagIcon code={code} className="w-4 h-4 text-[8px]" />
                  <span className="text-xs font-bold text-navy-200">{GROUP_LABEL[code] || code}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {items.map(r => {
                    const badge = sourceBadge(r.result_source);
                    // /lottery/results ส่ง winning_numbers เป็น JSON string — parse ก่อนใช้ heroNumbers
                    let w = r.winning || r.winning_numbers;
                    if (typeof w === 'string') { try { w = JSON.parse(w); } catch { w = null; } }
                    const heroes = heroNumbers(w).slice(0, 3);
                    const sumAll = resultSummary(w) || [];
                    const open = !!cardOpen[`${r.type_code}:${r.category_code || ''}`];
                    return (
                      <div key={`${r.type_code}:${r.category_code || ''}`}
                        className="bg-navy-800/70 border border-navy-700/60 rounded-xl px-3 py-2.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <FlagIcon code={r.type_code} className="w-4 h-4 text-[8px]" />
                          <span className="text-xs font-bold text-white">{r.category_name_th || r.type_name_th}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 font-bold">ออกผลแล้ว</span>
                          {badge && <span className={`text-[9px] px-1.5 py-0.5 rounded ${badge.cls}`}>{badge.short}</span>}
                        </div>
                        <div className="text-[10px] text-navy-400 mt-1">งวดวันที่ {thaiDate(r.draw_at)}</div>
                        {heroes.length > 0 && (
                          <div className="grid grid-cols-3 gap-1 mt-2">
                            {heroes.map(h => (
                              <div key={h.label} className="text-center bg-navy-900/60 rounded-lg py-1.5 px-1">
                                <div className="text-[8px] text-navy-400 leading-tight">{h.label}</div>
                                <div className="font-mono font-bold text-gold-300 text-sm leading-tight mt-0.5 break-all">{h.num}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        {sumAll.length > 0 && (
                          <button onClick={() => setCardOpen(e => ({ ...e, [`${r.type_code}:${r.category_code || ''}`]: !open }))}
                            className="mt-1.5 w-full text-left text-[10px] text-navy-400 hover:text-gold-300 transition">
                            {open ? '▾ ย่อผลทุกรางวัล' : '▸ ดูผลทุกรางวัล'}
                          </button>
                        )}
                        {open && sumAll.length > 0 && (
                          <div className="mt-1 text-[10px] text-navy-200 bg-navy-900/70 rounded-lg px-2 py-1.5 font-mono leading-relaxed break-all">
                            {sumAll.map((p, i) => <div key={i}>{p}</div>)}
                          </div>
                        )}
                        <div className="text-[9px] text-navy-500 mt-1.5">
                          อัปเดต {thaiTime(r.published_at || r.draw_at)}{r.published_at ? '' : ' (เวลาออกรางวัล)'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        );
      })()}

      {/* ค้นหารอบ — กรองตามรหัส/ชื่อรอบ/หมวด */}
      <div className="max-w-sm mx-auto">
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="🔍 ค้นหารหัสรอบ / ชื่อหวย เช่น HNN-20261119-00"
          className="w-full bg-navy-800 border border-navy-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-navy-500 focus:outline-none focus:border-gold-500/60" />
      </div>

      {/* tab กรองตามประเภทหวย — แสดงเฉพาะเมื่อมีมากกว่า 1 ประเภทในวันนี้ */}
      {typeTabs.length > 1 && (
        <div className="flex gap-1.5 flex-wrap justify-center">
          <button onClick={() => setTypeFilter('')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${!typeFilter ? 'bg-gold-500/20 border-gold-500/60 text-gold-300' : 'border-navy-600 text-navy-300 hover:bg-navy-800'}`}>
            ทั้งหมด ({draws.length})
          </button>
          {typeTabs.map(t => (
            <button key={t.code} onClick={() => setTypeFilter(typeFilter === t.code ? '' : t.code)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition inline-flex items-center gap-1.5 ${typeFilter === t.code ? 'bg-gold-500/20 border-gold-500/60 text-gold-300' : 'border-navy-600 text-navy-300 hover:bg-navy-800'}`}>
              <FlagIcon code={t.code} className="w-4 h-3 text-[7px]" />
              {t.label} ({t.n})
            </button>
          ))}
        </div>
      )}

      {/* ตารางออกรางวัล — จัดกลุ่มตามตลาด พร้อมตัวนับ ออกแล้ว X/Y */}
      <section className="bg-navy-800/70 border border-navy-700 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-navy-700 font-bold text-navy-950">
          📅 ตารางออกรางวัล {thaiShort(date)} ({draws.length} รอบ)
        </div>
        {!data && <div className="p-4 text-sm text-navy-400">กำลังโหลด…</div>}
        {data && !draws.length && (
          <div className="p-4">
            <EmptyState emoji="📅" title="ไม่มีรอบออกรางวัลในวันนี้"
              hint="ลองเลือกวันอื่น หรือรอระบบสร้างรอบใหม่" />
          </div>
        )}
        {data && !visibleGroups.length && draws.length > 0 && (
          <div className="p-4 text-sm text-navy-400 text-center">ไม่มีรอบของประเภทที่เลือก</div>
        )}
        {visibleGroups.map(g => {
          const done = g.items.filter(d => d.status === 'settled').length;
          const ac = typeAccent(g.type_code);
          return (
            <div key={g.key}>
              <div className="px-4 py-2 bg-navy-900/60 border-y border-navy-700/60 flex items-center gap-2">
                <FlagIcon code={g.type_code} className="w-4 h-4 text-[8px]" />
                <span className={`text-xs font-bold ${ac.text}`}>{g.label}</span>
                <span className="ml-auto text-[10px] text-navy-400 font-mono">ออกแล้ว {done}/{g.items.length}</span>
                {done > 0 && (
                  <button onClick={() => {
                    const txt = `${g.label} ${thaiShort(date)}\n` + g.items.filter(d => d.status === 'settled')
                      .map(d => `• ${d.draw_code}: ${compactSummary(d.winning) || '—'}`).join('\n');
                    navigator.clipboard?.writeText(txt).then(() => toast('คัดลอกผลรางวัลแล้ว', 'success')).catch(() => toast('คัดลอกไม่สำเร็จ', 'error'));
                  }} className="text-[10px] px-2 py-0.5 rounded border border-navy-600 text-navy-300 hover:border-gold-500/50 hover:text-gold-300" title="คัดลอกผลกลุ่มนี้">📋 คัดลอก</button>
                )}
              </div>
              <div className="divide-y divide-navy-700/60">
                {g.items.map(drawRow)}
              </div>
            </div>
          );
        })}
      </section>

      {/* ผลที่ออกแล้ว/รอผลแสดงในตารางออกรางวัลด้านบนครบแล้ว — ตัด section ซ้ำออก (layout LC: การ์ดล่าสุด → ตาราง → ผู้ชนะ → สถิติ) */}

      {/* ผู้ชนะของวันที่เลือก */}
      {dayWinners.length > 0 && (
        <section className="bg-navy-800/70 border border-gold-500/30 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-navy-700 font-bold text-gold-300">🏆 ผู้ชนะ {thaiShort(date)} ({dayWinners.length})</div>
          <div className="divide-y divide-navy-700/60">
            {dayWinners.map((w, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                <span className="text-gold-400 font-bold w-6">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-semibold truncate">{w.player} <span className="text-navy-400 font-normal text-xs">• {w.typeName}</span></div>
                  <div className="text-[11px] text-navy-400">เลข {w.number} • {w.ruleName}{w.isTod ? ' (โต๊ด)' : ''} • {w.drawCode}</div>
                </div>
                <div className="text-green-400 font-bold whitespace-nowrap">{satang(w.payout)} ฿</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ผลล่าสุดทุกตลาดย้ายขึ้นด้านบน (LC-style cards) — section นี้ถูกแทนที่แล้ว */}

      {/* P3: ประวัติย้อนหลัง + สถิติความถี่เลข */}
      <section className="bg-navy-800/70 border border-navy-700 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-navy-700 flex items-center gap-3 flex-wrap">
          <span className="font-bold text-navy-950">📊 สถิติย้อนหลัง</span>
          <select value={sel} onChange={e => setSel(e.target.value)}
            className="text-xs bg-navy-900 border border-navy-600 rounded-lg px-2 py-1.5 text-navy-100">
            {markets.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <select value={statLimit} onChange={e => setStatLimit(Number(e.target.value))}
            className="text-xs bg-navy-900 border border-navy-600 rounded-lg px-2 py-1.5 text-navy-100">
            <option value={30}>30 งวด</option><option value={60}>60 งวด</option><option value={100}>100 งวด</option>
          </select>
        </div>
        {statErr && <div className="p-3 text-sm text-red-300">{statErr}</div>}
        {!hist && !statErr && <div className="p-4 text-sm text-navy-400">กำลังโหลด…</div>}
        {hist && (
          <div className="grid grid-cols-1 md:grid-cols-2">
            {/* ความถี่เลข */}
            <div className="p-4 border-b md:border-b-0 md:border-r border-navy-700">
              <div className="text-xs font-bold text-navy-300 mb-2">ความถี่เลข ({stats?.draws_used ?? 0} งวด)</div>
              {stats && (
                <>
                  <div className="flex gap-1 mb-3">
                    {'0123456789'.split('').map(d => {
                      const c = stats.digit_freq[d] || 0;
                      const max = Math.max(...Object.values(stats.digit_freq), 1);
                      return (
                        <div key={d} className="flex-1 text-center">
                          <div className="text-[9px] text-navy-400">{d}</div>
                          <div className="bg-navy-900 rounded h-16 flex items-end overflow-hidden">
                            <div className="w-full bg-gradient-to-t from-gold-500 to-red-500" style={{ height: `${(c / max) * 100}%` }} />
                          </div>
                          <div className="text-[9px] text-navy-300">{c}</div>
                        </div>
                      );
                    })}
                  </div>
                  {stats.top2?.length > 0 && (
                    <div className="text-[11px] text-navy-300">
                      <div className="font-bold mb-1">เลข 2 ตัวออกบ่อย</div>
                      <div className="flex flex-wrap gap-1">
                        {stats.top2.slice(0, 10).map(t => (
                          <span key={t.number} className="bg-navy-900 border border-navy-600 rounded px-1.5 py-0.5 font-mono tabular-nums">
                            {t.number} <span className="text-gold-400">×{t.count}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {stats.overdue?.length > 0 && (
                    <div className="text-[11px] text-navy-300 mt-3">
                      <div className="font-bold mb-1 text-amber-300">เลขค้าง (ออกนานแล้ว)</div>
                      <div className="flex flex-wrap gap-1">
                        {stats.overdue.map(o => {
                          const num = o.key.slice(o.key.indexOf(':') + 1);
                          return (
                            <span key={o.key} className="bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5 font-mono tabular-nums text-amber-200"
                              title={`เคยออก ${o.count} ครั้ง • ห่างออก ${o.draws_ago} งวด`}>
                              {num} <span className="text-amber-400/80">-{o.draws_ago}งวด</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            {/* ประวัติ */}
            <div className="p-4 max-h-80 overflow-y-auto">
              <div className="text-xs font-bold text-navy-300 mb-2">ผลย้อนหลัง ({hist.draws.length} งวด)</div>
              <div className="space-y-1">
                {hist.draws.map(d => (
                  <div key={d.id} className="flex items-center gap-2 text-[11px] bg-navy-900/60 rounded px-2 py-1">
                    <span className="text-navy-400 w-24 shrink-0">{d.draw_at?.slice(5, 10)}</span>
                    <span className="font-mono tabular-nums text-slate-100 flex-1 truncate">{summarizeWinning(d.winning)}</span>
                    {d.result_source && <span className="text-[9px] text-navy-500 shrink-0">{d.result_source}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
