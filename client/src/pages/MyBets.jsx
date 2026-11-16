import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api, satang, drawLabel, fmtDateTime } from '../api.js';
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
  return `🎉 ฉันถูกรางวัล ${satang(s.total_payout)} บาท จาก ${s.type_name_th || ''} ${s.draw_code || ''} บน Demo Lottery! (เครดิตจำลอง เพื่อการศึกษา)`;
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

function ItemRow({ i }) {
  const emoji = ITEM_EMOJI[i.status] || '⏳';
  const anim = i.status === 'won' ? 'animate-win' : i.status === 'lost' ? 'animate-lose' : '';
  return (
    <div className={`flex items-center justify-between gap-2 text-sm rounded-lg px-3 py-2 ${i.status === 'won' ? 'bg-green-500/10 border border-green-500/30' : 'bg-navy-900'}`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-lg ${anim}`}>{emoji}</span>
        <div className="min-w-0">
          {(() => {
            const inst = instantDisplay(i);
            if (inst) {
              return (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-gold-300 font-bold text-sm">{inst.head}</span>
                    <span className="text-navy-300 text-xs truncate">{i.rule_name_th || BET_TYPE_LABELS[i.bet_type] || i.bet_type}</span>
                  </div>
                  {inst.sub && <div className="text-[11px] text-sky-300/90">{inst.sub}</div>}
                </>
              );
            }
            return (
              <div className="flex items-center gap-2">
                <code className="text-gold-300 font-mono text-base">{i.number}</code>
                <span className="text-navy-300 text-xs truncate">{i.rule_name_th || BET_TYPE_LABELS[i.bet_type] || i.bet_type}</span>
                {i.is_ann && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-500/20 border border-amber-500/50 text-amber-300 shrink-0">เลขอั้น</span>}
                {i.is_tod ? <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-sky-500/20 border border-sky-500/50 text-sky-300 shrink-0">โต๊ด</span> : null}
              </div>
            );
          })()}
          <div className="text-[11px] text-navy-400">เดิมพัน {satang(i.amount)} บาท</div>
        </div>
      </div>
      <div className="text-right shrink-0">
        {i.status === 'won' && (
          <div className={`font-bold text-green-400 ${anim}`}>
            <span className="text-base">💰</span> +{satang(i.payout)} บาท
          </div>
        )}
        {i.status === 'lost' && <div className={`text-red-400/90 text-xs ${anim}`}>เสีย {satang(i.amount)} บาท</div>}
        {i.status === 'pending' && (
          <div className="text-[11px]">
            <div className="text-blue-300">รอผล</div>
            <div className="text-gold-300/80">ถ้าถูก ได้ {satang(potential(i))} บาท</div>
          </div>
        )}
        {i.status === 'cancelled' && <div className="text-navy-400 text-xs">ยกเลิก</div>}
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

export default function MyBets() {
  const [slips, setSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [cancelAsk, setCancelAsk] = useState(null);
  const [filter, setFilter] = useState('all');
  const [shownCount, setShownCount] = useState(50); // แสดง 50 ก่อน ที่เหลือกด "แสดงเพิ่มเติม"
  const [celebrate, setCelebrate] = useState(null); // slip id ที่เพิ่งถูกรางวัล — โชว์ confetti
  const prevStatus = useRef({}); // id → status ครั้งก่อน — ใช้จับจังหวะที่โพยเปลี่ยนเป็น won
  const { setBalance } = useAuth();
  const navigate = useNavigate();

  // ดึงโพยล่าสุด 100 + โพย pending แยกเสมอ — กันโพยค้างเก่าหลุดจากหน้าต่าง limit
  const load = () => Promise.all([
    api('/bets/mine?limit=100'),
    api('/bets/mine?status=pending&limit=100'),
  ]).then(([recent, pending]) => {
    const seen = new Set();
    const list = [...pending.slips, ...recent.slips].filter(s => !seen.has(s.id) && seen.add(s.id));
    setSlips(list);
    // จับโพยที่เพิ่งเปลี่ยนเป็น won — เล่นเสียง + confetti (รอบแรกที่โหลดไม่ใช่)
    const newlyWon = list.find(s => s.status === 'won' && prevStatus.current[s.id] && prevStatus.current[s.id] !== 'won');
    list.forEach(s => { prevStatus.current[s.id] = s.status; });
    if (newlyWon) {
      sfx.win();
      setCelebrate(newlyWon.id);
      setTimeout(() => setCelebrate(c => (c === newlyWon.id ? null : c)), 5000);
    }
  }).catch(() => {});
  useEffect(() => { load().finally(() => setLoading(false)); }, []);
  // SSE — ผลรางวัลออก/โพยเปลี่ยนสถานะ → อัปเดตทันที
  useEffect(() => {
    const h = () => load();
    window.addEventListener('sys:update', h);
    return () => window.removeEventListener('sys:update', h);
  }, []);

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
      await load();
    } catch (e) { toast(e.message, 'error'); }
  };

  // filter ตามสถานะ + โพยรอผลขึ้นบนสุดเสมอ (ภายในกลุ่มเรียงใหม่→เก่า)
  const visibleSlips = slips
    .filter(s => filter === 'all' || s.status === filter)
    .sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || b.id - a.id);
  const pagedSlips = visibleSlips.slice(0, shownCount);
  useEffect(() => { setShownCount(50); }, [filter]); // เปลี่ยน filter → กลับมาแสดง 50 แรก

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-white">ประวัติโพยของฉัน</h1>
        {slips.length > 0 && (
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
            {f.k !== 'all' && slips.some(s => s.status === f.k) && (
              <span className="ml-1 text-[10px] opacity-70">({slips.filter(s => s.status === f.k).length})</span>
            )}
          </button>
        ))}
      </div>
      {pagedSlips.map(s => {
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
              <div className="border-t border-navy-700 px-5 py-3 space-y-2">
                {s.items.map(i => <ItemRow key={i.id} i={i} />)}
                {s.total_payout > 0 && (
                  <div className="text-right space-y-0.5 pt-1">
                    <div className="text-green-400 font-bold animate-coin">
                      🎉 รวมเงินรางวัล {satang(s.total_payout)} บาท
                    </div>
                    <div className={`text-xs font-semibold ${net >= 0 ? 'text-gold-300' : 'text-navy-400'}`}>
                      {net >= 0 ? `กำไรสุทธิ ${satang(net)} บาท` : `ขาดทุนสุทธิ ${satang(-net)} บาท`}
                    </div>
                  </div>
                )}
                {s.total_payout >= SHARE_THRESHOLD && (
                  <div className="pt-1 border-t border-navy-700/60">
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
      {visibleSlips.length > shownCount && (
        <button onClick={() => setShownCount(c => c + 50)}
          className="w-full py-3 rounded-xl border border-navy-600 text-navy-200 text-sm font-semibold hover:border-gold-500/50 hover:text-gold-300 transition">
          แสดงเพิ่มเติมอีก {Math.min(50, visibleSlips.length - shownCount)} รายการ (เหลือ {visibleSlips.length - shownCount})
        </button>
      )}
      {!loading && slips.length > 0 && !visibleSlips.length && (
        <div className="text-center text-navy-400 py-10 text-sm">ไม่มีโพยในสถานะนี้</div>
      )}
      {!loading && !slips.length && (
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
