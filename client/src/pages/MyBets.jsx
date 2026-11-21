import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api, satang, drawLabel, fmtDateTime, thaiDate } from '../api.js';
import { getTz } from '../time.js';
import { BET_TYPE_LABELS } from '../lotterySchema.js';
import { toast } from '../components/toast.js';
import { SkeletonSlip } from '../components/Skeleton.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { FlagIcon } from '../components/ResultLine.jsx';
import { useAuth } from '../auth.jsx';
import { sfx } from '../sound.js';

const STATUS_TH = {
  pending: 'รอผล',
  won: 'ถูกรางวัล',
  lost: 'ไม่ถูกรางวัล',
  partial: 'ถูกรางวัลบางรายการ',
  cancelled: 'ยกเลิก',
  refunded: 'คืนเงิน',
};
const STATUS_EMOJI = {
  pending: '⏳',
  won: '🎉',
  lost: '😢',
  partial: '🏆',
  cancelled: '🚫',
  refunded: '💸',
};
const ITEM_EMOJI = { won: '🎉', lost: '😢', pending: '⏳', cancelled: '🚫' };

// เกมด่วน — parse result_detail เพื่อแสดงเลขที่ออก/เต๋า/สัตว์ที่ถูก
const DICE_SYMBOLS = ['ปลา', 'กุ้ง', 'น้ำเต้า', 'เสือ', 'ปู', 'ไก่'];
const DICE_BET_LABEL = { single: 'สัตว์เดี่ยว', pair: 'สัตว์คู่', triple: 'สัตว์ตอง' };
const HILO_PICK_LABEL = { low: 'ต่ำ', high: 'สูง', eleven: '11' };
const jparse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const arr = (v) => Array.isArray(v) ? v : [];

// คืน { picks, drawn } สำหรับเกมด่วน — draws เป็นข้อความพร้อม emoji
function instantDisplay(i) {
  const bt = i.bet_type || '';
  const num = jparse(i.number);
  const det = jparse(i.result_detail) || {};
  if (bt === 'kiwi_dice') {
    const sel = arr(det.sel ?? num);           // เลขแต้ม 1-6 ที่เลือก
    const dice = arr(det.dice ?? det.drawn);   // เต๋าที่ออก
    const sym = (v) => DICE_SYMBOLS[v - 1] || String(v);
    const picksTxt = sel.map(sym).join('+');
    const drawnTxt = dice.length ? dice.map(sym).join(' ') : '—';
    return {
      head: `${DICE_BET_LABEL[det.betType] || 'น้ำเต้าปูปลา'} ${picksTxt}`,
      sub: `ออก ${drawnTxt}`,
    };
  }
  if (bt.startsWith('kiwi')) { // kiwi, kiwi_vip + เกมเก่า kiwi_zodiac/kiwi_animal
    const picks = arr(det.picks ?? num);
    const drawn = arr(det.drawn);
    const hits = det.hits ?? picks.filter(p => drawn.includes(p)).length;
    return {
      head: `ซื้อ ${picks.join(', ') || '—'}`,
      sub: drawn.length ? `ออก ${drawn.join(', ')} • ถูก ${hits} ตัว` : null,
    };
  }
  if (bt === 'hilo') {
    const dice = arr(det.dice);
    return {
      head: `เต๋า ${dice.join('-') || '—'} = ${det.sum ?? '—'}`,
      sub: det.pick ? `ทาย${HILO_PICK_LABEL[det.pick] || det.pick}` : null,
    };
  }
  if (bt === 'scratch') {
    return { head: i.number || 'สล็อต', sub: null };
  }
  return null;
}

// เงินรางวัลที่จะได้ถ้าถูก = เงินเดิมพัน × อัตราจ่าย (est_payout = อัตราเฉพาะรายเลขของเลขอั้นถ้ามี)
const potential = (i) => i.est_payout ?? Math.floor(i.amount * Number(i.payout_multiplier || 0));

// แสดงปุ่มแชร์เมื่อชนะรางวัลตั้งแต่ 500 บาท ขึ้นไป
const SHARE_THRESHOLD = 50000; // สตางค์

function shareText(s) {
  return `🎉 ฉันถูกรางวัล ${satang(s.total_payout)} บาท จาก ${s.type_name_th || ''} ${s.draw_code || ''} บน Devin Lottery! (เครดิตจำลอง เพื่อการศึกษา)`;
}

function ShareButtons({ s }) {
  const [copied, setCopied] = useState(false);
  const text = shareText(s);
  const url = encodeURIComponent(window.location.origin);
  const lineUrl = `https://social-plugins.line.me/lineit/share?url=${url}&text=${encodeURIComponent(text)}`;
  const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${encodeURIComponent(text)}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${text} ${window.location.origin}`); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { toast('คัดลอกไม่สำเร็จ — ลองคัดลอกเอง', 'error'); }
  };
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-navy-300">แชร์ความสำเร็จ:</span>
      <a href={lineUrl} target="_blank" rel="noreferrer"
        className="text-xs bg-green-600 hover:bg-green-500 text-white font-bold px-3 py-1.5 rounded-lg">
        LINE
      </a>
      <a href={fbUrl} target="_blank" rel="noreferrer"
        className="text-xs bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1.5 rounded-lg">
        Facebook
      </a>
      <button onClick={copy}
        className="text-xs border border-navy-500 text-navy-200 hover:bg-navy-700 px-3 py-1.5 rounded-lg">
        {copied ? '✓ คัดลอกแล้ว' : '📋 คัดลอกข้อความ'}
      </button>
    </div>
  );
}

function ItemRow({ i, paper = false }) {
  const emoji = ITEM_EMOJI[i.status] || '⏳';
  const anim = i.status === 'won' ? 'animate-win' : i.status === 'lost' ? 'animate-lose' : '';
  // โหมดกระดาษ (paper) — พื้นครีม ตัวหนังสือน้ำตาลเข้ม อ่านเหมือนโพยจริง
  const rowCls = paper
    ? `flex items-center justify-between gap-2 text-sm rounded-lg px-3 py-2 ${i.status === 'won' ? 'bg-[#ecd9a8] border border-[#b89b62]' : 'bg-[#fbf3df]/70'}`
    : `flex items-center justify-between gap-2 text-sm rounded-lg px-3 py-2 ${i.status === 'won' ? 'bg-green-500/10 border border-green-500/30' : 'bg-navy-900'}`;
  const numCls = paper ? 'text-[#8a5a00]' : 'text-gold-300';
  const ruleCls = paper ? 'text-[#6b5636]' : 'text-navy-300';
  const dimCls = paper ? 'text-[#8a7a5c]' : 'text-navy-400';
  return (
    <div className={rowCls}>
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-lg ${anim}`}>{emoji}</span>
        <div className="min-w-0">
          {(() => {
            const inst = instantDisplay(i);
            if (inst) {
              return (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-bold text-sm ${paper ? 'text-[#8a5a00]' : 'text-gold-300'}`}>{inst.head}</span>
                    <span className={`text-xs truncate ${ruleCls}`}>{i.rule_name_th || BET_TYPE_LABELS[i.bet_type] || i.bet_type}</span>
                  </div>
                  {inst.sub && <div className={`text-[11px] ${paper ? 'text-[#2b6cb0]' : 'text-sky-300/90'}`}>{inst.sub}</div>}
                </>
              );
            }
            return (
              <div className="flex items-center gap-2">
                <code className={`font-mono text-base ${numCls}`}>{i.number}</code>
                <span className={`text-xs truncate ${ruleCls}`}>{i.rule_name_th || BET_TYPE_LABELS[i.bet_type] || i.bet_type}</span>
                {i.is_ann && <span className={`text-[9px] font-bold px-1 py-0.5 rounded shrink-0 ${paper ? 'bg-amber-600/20 border border-amber-700/50 text-amber-800' : 'bg-amber-500/20 border border-amber-500/50 text-amber-300'}`}>เลขอั้น</span>}
                {i.is_tod ? <span className={`text-[9px] font-bold px-1 py-0.5 rounded shrink-0 ${paper ? 'bg-sky-700/15 border border-sky-700/40 text-sky-800' : 'bg-sky-500/20 border border-sky-500/50 text-sky-300'}`}>โต๊ด</span> : null}
              </div>
            );
          })()}
          <div className={`text-[11px] ${dimCls}`}>เดิมพัน {satang(i.amount)} บาท</div>
        </div>
      </div>
      <div className="text-right shrink-0">
        {i.status === 'won' && (
          <div className={`font-bold ${anim} ${paper ? 'text-[#1e7d46]' : 'text-green-400'}`}>
            <span className="text-base">💰</span> +{satang(i.payout)} บาท
          </div>
        )}
        {i.status === 'lost' && <div className={`text-xs ${anim} ${paper ? 'text-[#8a4b2a]' : 'text-red-400/90'}`}>เสีย {satang(i.amount)} บาท</div>}
        {i.status === 'pending' && (
          <div className="text-[11px]">
            <div className={paper ? 'text-[#2b6cb0]' : 'text-blue-300'}>รอผล</div>
            <div className={paper ? 'text-[#8a5a00]/80' : 'text-gold-300/80'}>ถ้าถูก ได้ {satang(potential(i))} บาท</div>
          </div>
        )}
        {i.status === 'cancelled' && <div className={`text-xs ${dimCls}`}>ยกเลิก</div>}
      </div>
    </div>
  );
}

const FILTERS = [
  { k: 'all', label: 'ทั้งหมด' },
  { k: 'pending', label: 'รอผล' },
  { k: 'won', label: 'ถูกรางวัล' },
  { k: 'partial', label: 'ถูกบางส่วน' },
  { k: 'lost', label: 'ไม่ถูก' },
  { k: 'cancelled', label: 'ยกเลิก' },
  { k: 'refunded', label: 'คืนเงิน' },
];

const PAGE = 50;

// กลุ่มโพยตามวันที่ออกรางวัล — key 'YYYY-MM-DD' ตาม timezone ที่ผู้ใช้เลือก
function slipDay(s) {
  const raw = s.draw_at || s.created_at;
  const d = raw ? new Date(String(raw).replace(' ', 'T') + 'Z') : null;
  if (!d || isNaN(d)) return { key: 'unknown', label: 'ไม่ระบุวันที่' };
  const fmt = (x) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: getTz() }).format(x); } catch { return x.toISOString().slice(0, 10); } };
  const key = fmt(d);
  const label = key === fmt(new Date()) ? 'วันนี้' : key === fmt(new Date(Date.now() - 864e5)) ? 'เมื่อวาน' : thaiDate(raw);
  return { key, label };
}

export default function MyBets() {
  const [slips, setSlips] = useState([]);        // โพยของ filter ปัจจุบันที่โหลดมาแล้ว (ทุกหน้าที่กดเพิ่มเติม)
  const [pendingList, setPendingList] = useState([]); // โพยรอผลทั้งหมด — แยก fetch เสมอ กันโพยค้างเก่าหลุด
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [cancelAsk, setCancelAsk] = useState(null);
  const [filter, setFilter] = useState('all');
  const filterRef = useRef('all');
  const [collapsed, setCollapsed] = useState(() => new Set()); // key กลุ่มวันที่ที่ย่ออยู่
  const toggleGroup = (k) => setCollapsed(prev => {
    const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n;
  });
  const [celebrate, setCelebrate] = useState(null); // slip id ที่เพิ่งถูกรางวัล — โชว์ confetti
  const prevStatus = useRef({}); // id → status ครั้งก่อน — ใช้จับจังหวะที่โพยเปลี่ยนเป็น won
  const { setBalance } = useAuth();
  const navigate = useNavigate();

  const [total, setTotal] = useState(0); // จำนวนโพยทั้งหมดของ filter ปัจจุบัน (จาก server)

  // โหลดโพย 1 หน้า (50 รายการ) ตาม filter — 'all' ใช้ endpoint รวม, status อื่นใช้ status=...
  const fetchPage = (f, offset) => {
    const qs = f === 'all' ? `limit=${PAGE}&offset=${offset}` : `status=${f}&limit=${PAGE}&offset=${offset}`;
    return api(`/bets/mine?${qs}`).then(r => ({ list: Array.isArray(r?.slips) ? r.slips : [], total: Number(r?.total) || 0 }));
  };

  // โหลดโพย pending ทั้งหมด (cap 500 — pending ต่อ user มีจำกัดอยู่แล้ว)
  const fetchPending = () => api('/bets/mine?status=pending&limit=500')
    .then(r => (Array.isArray(r?.slips) ? r.slips : []));

  // โหลด filter ปัจจุบันหน้าแรก — ใช้ทั้ง mount และเปลี่ยน filter
  const load = () => {
    const f = filterRef.current;
    if (f === 'pending') {
      return fetchPending().then(list => { setPendingList(list); setSlips(list); setHasMore(false); });
    }
    return Promise.all([fetchPending(), fetchPage(f, 0)]).then(([pending, page]) => {
      setPendingList(pending);
      setSlips(page.list);
      setTotal(page.total);
      setHasMore(page.list.length < page.total);
    });
  };

  // โหลดหน้าเพิ่มเติม (append) — ไม่แทนที่ของเดิม
  const loadMore = async () => {
    const f = filterRef.current;
    if (f === 'pending' || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(f, slips.length);
      setSlips(prev => {
        const seen = new Set(prev.map(s => s.id));
        return [...prev, ...page.list.filter(s => !seen.has(s.id))];
      });
      setTotal(page.total);
      setHasMore(slips.length + page.list.length < page.total);
    } catch {} finally { setLoadingMore(false); }
  };

  // refresh หลัง SSE — ดึง pending ใหม่ + refetch หน้าที่โหลดอยู่ทั้งหมด (รักษาจำนวนหน้าที่ user เลื่อนไปถึง)
  const refreshLoaded = () => {
    const f = filterRef.current;
    if (f === 'pending') {
      fetchPending().then(list => { setPendingList(list); setSlips(list); }).catch(() => {});
      return;
    }
    fetchPending().then(setPendingList).catch(() => {});
    const pages = Math.max(1, Math.ceil(slips.length / PAGE));
    Promise.all(Array.from({ length: pages }, (_, i) => fetchPage(f, i * PAGE).then(p => p.list).catch(() => [])))
      .then(chunks => {
        const seen = new Set();
        const merged = [];
        for (const c of chunks) for (const s of c) if (!seen.has(s.id)) { seen.add(s.id); merged.push(s); }
        setSlips(merged);
        setHasMore(merged.length < total);
        // จับโพยที่เพิ่งเปลี่ยนเป็น won — เล่นเสียง + confetti (รอบแรกที่โหลดไม่ใช่)
        const newlyWon = merged.find(s => s.status === 'won' && prevStatus.current[s.id] && prevStatus.current[s.id] !== 'won');
        merged.forEach(s => { prevStatus.current[s.id] = s.status; });
        if (newlyWon) {
          sfx.win(); navigator.vibrate?.([80,40,80]); // haptic ฉลองถูกรางวัล
          setCelebrate(newlyWon.id);
          setTimeout(() => setCelebrate(c => (c === newlyWon.id ? null : c)), 5000);
        }
      }).catch(() => {});
  };

  useEffect(() => {
    filterRef.current = filter;
    setLoading(true);
    load().catch(() => {}).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);
  // SSE — ผลรางวัลออก/โพยเปลี่ยนสถานะ → อัปเดตทันที
  useEffect(() => {
    const h = () => refreshLoaded();
    window.addEventListener('sys:update', h);
    return () => window.removeEventListener('sys:update', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, slips.length, total]);

  // ยกเลิกได้เฉพาะโพย pending ของรอบที่ยังเปิดรับอยู่ — โพยเกมด่วน (STANDING) ยกเลิกได้ตราบใดที่ยังไม่ตัดสิน
  const nowSql = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const canCancel = (s) => s.status === 'pending' && (
    (s.draw_status === 'open' && s.close_at > nowSql) || String(s.draw_code || '').endsWith('-STANDING'));

  // ยิงซ้ำได้เฉพาะโพย pending ของรอบที่ยังเปิดรับอยู่ — พาไปหน้แทงพร้อมรายการเดิมให้ตรวจก่อนส่ง
  const canRepeat = (s) => s.status === 'pending' && s.draw_status === 'open' && s.close_at > nowSql
    && (s.items || []).some(i => i.status === 'pending' && i.rule_id);
  const repeatSlip = (s) => {
    const items = (s.items || []).filter(i => i.status === 'pending' && i.rule_id)
      .map(i => ({ ruleId: i.rule_id, number: i.number, amount: i.amount, isTod: !!i.is_tod }));
    navigate(`/bet/${s.draw_id}`, { state: { repeat: { ref: s.slip_ref, items } } });
  };

  const cancelSlip = async (s) => {
    if (cancelAsk !== s.id) {
      setCancelAsk(s.id);
      setTimeout(() => setCancelAsk(c => (c === s.id ? null : c)), 3500);
      return;
    }
    setCancelAsk(null);
    try {
      const r = await api(`/bets/${s.id}/cancel`, { method: 'POST' });
      if (typeof r.balance === 'number') setBalance(r.balance);
      toast(`ยกเลิกโพย ${r.slipRef} แล้ว — คืนเครดิต ${satang(r.refunded)} บาท`, 'success');
      refreshLoaded();
    } catch (e) { toast(e.message, 'error'); }
  };

  // รวมข้อมูลตาม filter: 'all' = pending ทั้งหมด + หน้าที่โหลดของทั้งหมด (กันซ้ำ),
  // 'pending' = pendingList, status อื่น = slips ที่ server filter มาแล้ว
  const merged = filter === 'all'
    ? [...pendingList, ...slips].filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i)
    : filter === 'pending' ? pendingList : slips;
  // filter ตามสถานะ + โพยรอผลขึ้นบนสุดเสมอ (ภายในกลุ่มเรียงใหม่→เก่า)
  const visibleSlips = merged
    .filter(s => filter === 'all' || filter === 'pending' || s.status === filter)
    .sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || b.id - a.id);
  const pagedSlips = visibleSlips;

  // จัดกลุ่มโพยตามวันที่ออกรางวัล — คงลำดับ pending ขึ้นก่อนตาม sort เดิม
  const groups = [];
  {
    const m = new Map();
    for (const s of pagedSlips) {
      const { key, label } = slipDay(s);
      if (!m.has(key)) { const g = { key, label, slips: [], stake: 0 }; m.set(key, g); groups.push(g); }
      const g = m.get(key); g.slips.push(s); g.stake += s.total_stake || 0;
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-white">ประวัติโพยของฉัน</h1>
        {visibleSlips.length > 0 && (
          <a href="/api/bets/export" download
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gold-500/40 text-gold-300 hover:bg-gold-500/10 transition inline-flex items-center gap-1">
            ⬇️ Export CSV
          </a>
        )}
      </div>
      <p className="text-[11px] text-navy-400 -mt-2">
        📌 หากรอบหวยถูกยกเลิก ระบบคืนเครดิตเต็มจำนวนอัตโนมัติ • ยกเลิกโพยเองได้ก่อนเวลาปิดรับ</p>
      {/* filter สถานะ + เรียงโพยรอผลขึ้นก่อนเสมอ */}
      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map(f => (
          <button key={f.k} onClick={() => setFilter(f.k)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${filter === f.k
              ? 'bg-gold-500/20 border-gold-500/60 text-gold-300'
              : 'border-navy-600 text-navy-300 hover:bg-navy-800'}`}>
            {f.label}
            {f.k === 'pending' && pendingList.length > 0 && (
              <span className="ml-1 text-[10px] opacity-70">({pendingList.length})</span>
            )}
          </button>
        ))}
      </div>
      {groups.map(g => {
        const isCol = collapsed.has(g.key);
        return (
        <div key={g.key}>
          <button type="button" onClick={() => toggleGroup(g.key)}
            className="w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-navy-800/80 border border-navy-700 hover:border-gold-500/40 transition text-left">
            <span className="flex items-center gap-2 text-sm font-bold text-white min-w-0">
              <span className={`text-navy-400 transition-transform shrink-0 ${isCol ? '' : 'rotate-90'}`}>▸</span>
              <span className="truncate">{g.label}</span>
              <span className="text-[11px] font-normal text-navy-400 shrink-0">{g.slips.length} โพย • {satang(g.stake)} บาท</span>
            </span>
            {g.slips.some(s => s.status === 'won') && (
              <span className="text-[10px] font-bold text-green-300 shrink-0">🏆 มีถูกรางวัล</span>
            )}
          </button>
          {!isCol && (
          <div className="space-y-3 mt-3">
          {g.slips.map(s => {
        const won = s.items?.some(i => i.status === 'won') || s.status === 'won';
        const lost = !won && s.items?.every(i => i.status === 'lost');
        const cardAnim = s.status === 'won' ? 'animate-win' : lost && s.status === 'lost' ? 'animate-lose' : '';
        const net = (s.total_payout || 0) - (s.total_stake || 0);
        return (
          <div key={s.id} className={`bg-gradient-to-b from-navy-800 to-navy-900 border rounded-xl overflow-hidden hoverable ${s.status === 'won' ? 'border-green-500/40' : 'border-navy-700'} ${cardAnim}`}>
            <div role="button" tabIndex={0}
              onClick={() => setOpen(open === s.id ? null : s.id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(open === s.id ? null : s.id); } }}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-navy-700/40 cursor-pointer">
              <div className="text-left">
                <div className="font-mono text-gold-300">{s.slip_ref}</div>
                <div className="flex items-center gap-1.5 text-sm text-navy-300">
                  <FlagIcon code={s.type_code} className="w-5 h-3.5 text-[7px]" />
                  {drawLabel(s) || `${s.type_name_th} • ${s.draw_code}`}
                </div>
                <div className="text-[11px] text-navy-500">แทงเมื่อ {fmtDateTime(s.created_at)}</div>
              </div>
              <div className="text-right flex flex-col items-end gap-1.5">
                <div className="font-bold text-white">{satang(s.total_stake)} บาท</div>
                <span className={`text-xs px-2 py-0.5 rounded inline-flex items-center gap-1 ${s.status === 'won' ? 'bg-green-500/20 text-green-300' : s.status === 'lost' ? 'bg-navy-700 text-navy-300' : s.status === 'partial' ? 'bg-gold-500/20 text-gold-300' : 'bg-blue-500/20 text-blue-300'}`}>
                  <span>{STATUS_EMOJI[s.status]}</span> {STATUS_TH[s.status]}
                </span>
                {/* ปุ่มลัดเห็นได้เลยไม่ต้องกางโพย — ยิงซ้ำ/ยกเลิก เฉพาะโพย pending ของรอบที่ยังเปิดรับอยู่ */}
                {canRepeat(s) && (
                  <button onClick={(e) => { e.stopPropagation(); repeatSlip(s); }}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-sky-400/50 text-sky-300 hover:bg-sky-500/15">
                    🔁 แทงซ้ำ
                  </button>
                )}
                {canCancel(s) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); cancelSlip(s); }}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition ${cancelAsk === s.id ? 'bg-red-500 text-white border-red-500 animate-pulse' : 'border-gold-400/50 text-gold-300 hover:bg-gold-500/15'}`}>
                    {cancelAsk === s.id ? '⚠️ ยืนยัน?' : '🚫 ยกเลิก'}
                  </button>
                )}
              </div>
            </div>
            {open === s.id && (
              <div className="border-t border-navy-700 px-5 py-4 space-y-3">
                {/* โพยสไตล์กระดาษ — เลข monospace + เส้นประ + stamp ผลรางวัลเอียง */}
                <div className="paper-slip rounded-lg px-4 py-4 pt-5 pb-6 mx-auto max-w-xl">
                  {s.status === 'won' && <div className="paper-stamp win">ถูกรางวัล</div>}
                  {s.status === 'lost' && <div className="paper-stamp" style={{ borderColor: '#8a7a5c', color: '#8a7a5c' }}>ไม่ถูก</div>}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold tracking-widest text-[#8a7a5c] uppercase">โพยแทงหวย</span>
                    <span className="paper-num text-sm text-[#8a5a00]">{s.slip_ref}</span>
                  </div>
                  <div className="paper-dash mb-2" />
                  <div className="space-y-1.5">
                    {s.items.map(i => <ItemRow key={i.id} i={i} paper />)}
                  </div>
                  <div className="paper-dash my-2" />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#6b5636] font-semibold">ยอดรวมเดิมพัน</span>
                    <span className="paper-num text-[#2b2118]">{satang(s.total_stake)} บาท</span>
                  </div>
                  {s.total_payout > 0 && (
                    <>
                      <div className="flex items-center justify-between text-sm mt-1">
                        <span className="text-[#1e7d46] font-bold">เงินรางวัลรวม</span>
                        <span className="paper-num text-[#1e7d46]">{satang(s.total_payout)} บาท</span>
                      </div>
                      <div className="flex items-center justify-between text-xs mt-1">
                        <span className="text-[#6b5636]">กำไร/ขาดทุนสุทธิ</span>
                        <span className={`font-bold ${net >= 0 ? 'text-[#1e7d46]' : 'text-[#8a4b2a]'}`}>
                          {net >= 0 ? `+${satang(net)}` : `-${satang(-net)}`} บาท
                        </span>
                      </div>
                    </>
                  )}
                  <div className="paper-dash mt-2" />
                  <div className="text-center text-[10px] text-[#8a7a5c] mt-2 tracking-wide">
                    {drawLabel(s) || s.draw_code} • แทงเมื่อ {fmtDateTime(s.created_at)} • เครดิตเสมือนเพื่อการศึกษา
                  </div>
                </div>
                {s.total_payout >= SHARE_THRESHOLD && (
                  <div className="pt-1">
                    <ShareButtons s={s} />
                  </div>
                )}
                {canRepeat(s) && (
                  <div className="pt-1">
                    <button onClick={() => repeatSlip(s)}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg border border-sky-400/60 text-sky-600 hover:bg-sky-50">
                      🔁 แทงซ้ำโพยนี้ (รายการเดิม)
                    </button>
                  </div>
                )}
                {canCancel(s) && (
                  <div className="pt-1">
                    <button onClick={() => cancelSlip(s)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition ${cancelAsk === s.id ? 'bg-red-500 text-white border-red-500' : 'border-red-300 text-red-600 hover:bg-red-50'}`}>
                      {cancelAsk === s.id ? '⚠️ ยืนยันยกเลิก? กดอีกครั้งเพื่อคืนเครดิตเต็มจำนวน' : '🚫 ยกเลิกโพย (คืนเครดิต)'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
          })}
          </div>
          )}
        </div>
        );
      })}
      {hasMore && filter !== 'pending' && (
        <button onClick={loadMore} disabled={loadingMore}
          className="w-full py-3 rounded-xl border border-navy-600 text-navy-200 text-sm font-semibold hover:border-gold-500/50 hover:text-gold-300 transition disabled:opacity-50">
          {loadingMore ? 'กำลังโหลด...' : `แสดงเพิ่มเติมอีก 50 รายการ (เหลือ ${(total - slips.length).toLocaleString()})`}
        </button>
      )}
      {!loading && !loadingMore && (slips.length > 0 || pendingList.length > 0) && !visibleSlips.length && (
        <div className="text-center text-navy-400 py-10 text-sm">ไม่มีโพยในสถานะนี้</div>
      )}
      {!loading && !slips.length && !pendingList.length && (
        <EmptyState emoji="🎟️" title="ยังไม่มีโพยที่ส่ง" hint="เลือกประเภทหวยและใส่เลขเพื่อเริ่มแทงครั้งแรก"
          to="/lotteries" cta="ไปเลือกหวยเลย" />
      )}
      {loading && <div className="space-y-3">{[0,1,2].map(i => <SkeletonSlip key={i} />)}</div>}

      {/* confetti ฉลองตอนโพยเปลี่ยนเป็นถูกรางวัล — แสดง 5 วิแล้วหาย */}
      {celebrate && createPortal(
        <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden">
          {Array.from({ length: 36 }).map((_, i) => (
            <span key={i} className="confetti-piece"
              style={{
                left: `${(i * 29 + 7) % 100}%`,
                background: ['#d4af37', '#22c55e', '#f472b6', '#60a5fa', '#fbbf24', '#a78bfa'][i % 6],
                animationDuration: `${2 + (i % 5) * 0.4}s`,
                animationDelay: `${(i % 9) * 0.15}s`,
                borderRadius: i % 3 === 0 ? '50%' : '2px',
              }} />
          ))}
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 text-center">
            <div className="text-5xl animate-win">🎉</div>
            <div className="text-xl font-bold text-gold-300 mt-2 drop-shadow-lg">โพยของคุณถูกรางวัล!</div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
