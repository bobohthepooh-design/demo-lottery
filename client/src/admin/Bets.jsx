import { useEffect, useRef, useState } from 'react';
import { api, satang, drawLabel, fmtDateTime } from '../api.js';
import { Input, Button } from '../components/ui/index.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/shadcn/select.jsx';
import { Badge } from '../components/shadcn/badge.jsx';
import { cn } from '../lib/utils.js';
import { useUrlFilters, TablePager } from './useUrlFilters.jsx';

const STATUS_TH = {
  pending: 'รอผล', won: 'ถูกรางวัล', lost: 'ไม่ถูก',
  partial: 'ถูกรางวัลบางส่วน', cancelled: 'ยกเลิก', refunded: 'คืนเงิน',
};
const STATUS_EMOJI = {
  pending: '⏳', won: '🎉', lost: '🤑', partial: '😐', cancelled: '🚫', refunded: '💸',
};
const ITEM_EMOJI = { won: '🎉', lost: '😄', pending: '⏳', cancelled: '🚫' };

const SLIP_STYLE = {
  won: 'border-green-500/40',
  lost: 'border-navy-700',
  partial: 'border-gold-500/40',
  pending: 'border-blue-500/30',
  cancelled: 'border-navy-700 opacity-60',
  refunded: 'border-navy-700 opacity-60',
};

const LUXURY_SLIP_STYLE = {
  won: { borderColor: 'var(--success-green)', background: 'rgba(34, 197, 94, 0.1)' },
  lost: { borderColor: 'var(--border-light)', background: 'var(--bg-card)' },
  partial: { borderColor: 'var(--gold-primary)', background: 'rgba(212, 175, 55, 0.1)' },
  pending: { borderColor: 'var(--info-blue)', background: 'rgba(59, 130, 246, 0.1)' },
  cancelled: { borderColor: 'var(--border-light)', background: 'var(--bg-card)', opacity: 0.6 },
  refunded: { borderColor: 'var(--border-light)', background: 'var(--bg-card)', opacity: 0.6 },
};

const FETCH_LIMIT = 500;  // server cap ต่อ request
const MAX_SLIP_ROWS = 2000; // safety cap — กัน dataset ใหญ่เกิน
const PAGE_SIZE = 50;
const potential = (i) => Math.floor(i.amount * Number(i.payout_multiplier || 0));

function ItemRow({ i }) {
  const emoji = ITEM_EMOJI[i.status] || '⏳';
  return (
    <div className={`flex items-center justify-between gap-2 text-sm rounded-lg px-3 py-2 ${i.status === 'won' ? 'luxury-badge-success' : ''}`} style={i.status !== 'won' ? { background: 'var(--bg-dark-surface)', border: '1px solid var(--border-light)' } : {}}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-lg">{emoji}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <code className="font-mono [color:var(--gold-primary)]">{i.number}</code>
            <span className="text-xs truncate [color:var(--muted-gray)]">{i.bet_name_th || i.bet_type}</span>
          </div>
          <div className="[color:var(--dark-gray)] [font-size:11px]">เดิมพัน {satang(i.amount)} บาท</div>
        </div>
      </div>
      <div className="text-right shrink-0">
        {i.status === 'won' && (
          <div className="font-bold [color:var(--success-green)]">💰 จ่าย {satang(i.payout)} บาท</div>
        )}
        {i.status === 'lost' && <div className="text-xs font-medium [color:var(--muted-gray)]">ผู้เล่นเสีย {satang(i.amount)} บาท — ระบบได้กำไร</div>}
        {i.status === 'pending' && (
          <div className="text-[11px]">
            <div className="[color:var(--info-blue)]">รอผล</div>
            <div className="[color:var(--gold-primary)] [opacity:0.8]">ถ้าถูก ได้ {satang(potential(i))} บาท</div>
          </div>
        )}
        {i.status === 'cancelled' && <div className="[color:var(--muted-gray)] [font-size:12px]">ยกเลิก</div>}
      </div>
    </div>
  );
}

// export CSV — BOM ให้ Excel เปิดภาษาไทยได้
function exportCsv(rows, filename) {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['เลขโพย', 'สมาชิก', 'รอบหวย', 'ประเภท', 'ยอดเดิมพัน', 'ยอดจ่าย', 'สถานะ', 'เวลา'];
  const lines = [head.join(',')];
  for (const s of rows) {
    lines.push([s.slip_ref, s.username, s.draw_code, s.type_name_th || s.category_name_th || '',
      s.total_stake, s.total_payout, STATUS_TH[s.status] || s.status, s.created_at].map(esc).join(','));
  }
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function AdminBets() {
  const [filtered, setFiltered] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  // filter sync กับ URL query (?status=&q=) — refresh/share link แล้ว filter ยังอยู่
  const [filters, setFilters] = useUrlFilters({ status: '', q: '' });
  const { status, q: qApplied } = filters;
  const [q, setQ] = useState(filters.q); // draft ขณะพิมพ์ — commit ลง URL หลัง debounce
  const [open, setOpen] = useState(null);
  const [err, setErr] = useState('');
  const debounceRef = useRef(null);

  const buildQs = (offset) => {
    const p = new URLSearchParams({ limit: String(FETCH_LIMIT), offset: String(offset) });
    if (status) p.set('status', status);
    if (qApplied) p.set('q', qApplied);
    return p.toString();
  };

  // ดึงทุกรายการที่ตรง filter (วน offset ทีละ FETCH_LIMIT) แล้ว paginate ฝั่ง client
  const load = async () => {
    try {
      const all = [];
      let offset = 0, totalRows = 0;
      for (;;) {
        const r = await api(`/admin/bets?${buildQs(offset)}`);
        const list = Array.isArray(r?.slips) ? r.slips : [];
        totalRows = Number(r?.total) || 0;
        all.push(...list);
        offset += list.length;
        if (!list.length || list.length < FETCH_LIMIT || all.length >= totalRows || all.length >= MAX_SLIP_ROWS) break;
      }
      setTotal(totalRows);
      setFiltered(all);
      setErr('');
    } catch (e) { setFiltered([]); setErr(e?.message || 'โหลดข้อมูลไม่สำเร็จ'); }
  };

  // filter เปลี่ยน → โหลดใหม่ + กลับหน้า 1
  useEffect(() => { setPage(1); load(); }, [status, qApplied]); // eslint-disable-line react-hooks/exhaustive-deps

  // sync draft กลับมากรณี URL เปลี่ยนจากที่อื่น (back/forward/share)
  useEffect(() => { setQ(filters.q); }, [filters.q]);

  // ค้นหาแบบ debounce 400ms — commit ลง URL params (replace ไม่รัว history)
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setFilters({ q: q.trim() }), 400);
    return () => clearTimeout(debounceRef.current);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  // client-side pagination — filtered = ข้อมูลทั้งหมดที่ตรง filter (สำหรับ export), paged = เฉพาะหน้าที่แสดง
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const curPage = Math.min(page, pageCount);
  const paged = filtered.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);

  // export CSV — ดึงทุกรายการที่ตรง filter (cap 2000) ไม่ใช่แค่หน้าที่โหลดอยู่
  const exportAll = async () => {
    const p = new URLSearchParams({ limit: '2000', offset: '0' });
    if (status) p.set('status', status);
    if (qApplied) p.set('q', qApplied);
    try {
      const r = await api(`/admin/bets?${p}`);
      exportCsv(Array.isArray(r?.slips) ? r.slips : [], `bets-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) { setErr(e?.message || 'export ไม่สำเร็จ'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold luxury-gradient-text">ตรวจสอบโพย (Bet Monitoring)</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="ค้นหา username / เลขโพย / รอบหวย..."
            className="luxury-input text-sm [width:16rem] [padding:0.6rem_0.75rem]" />
          <Select value={status || 'all'} onValueChange={v => setFilters({ status: v === 'all' ? '' : v })}>
            <SelectTrigger className="w-36 py-2 text-sm [background:var(--bg-dark-surface)] [border:1px_solid_var(--border-light)] [color:var(--white)]">
              <SelectValue placeholder="ทุกสถานะ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกสถานะ</SelectItem>
              {Object.entries(STATUS_TH).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <button onClick={exportAll} className="luxury-btn-ghost text-sm px-3 py-2"
            title="ดาวน์โหลดโพยทั้งหมดที่ตรงเงื่อนไขเป็น CSV">
            ⬇ CSV
          </button>
        </div>
      </div>
      {err && <div className="text-sm rounded-lg p-3 [color:var(--danger-red)] [background:rgba(239,_68,_68,_0.1)] [border:1px_solid_var(--danger-red)]">เกิดข้อผิดพลาด: {err}</div>}
      <div className="[color:var(--muted-gray)] [font-size:12px]">ทั้งหมด {total.toLocaleString()} โพย{filtered.length < total ? ` — โหลด ${filtered.length.toLocaleString()} รายการแรก` : ''}</div>
      <div className="space-y-3">
        {paged.map(s => {
          const houseNet = (s.total_stake || 0) - (s.total_payout || 0); // มุมเจ้ามือ: บวก = ได้กำไร
          const settled = ['won', 'lost', 'partial'].includes(s.status);
          const style = LUXURY_SLIP_STYLE[s.status] || LUXURY_SLIP_STYLE.lost;
          return (
            <div key={s.id} className="rounded-xl overflow-hidden" style={{ background: style.background, border: `1px solid ${style.borderColor}`, opacity: style.opacity || 1 }}>
              <button onClick={() => setOpen(open === s.id ? null : s.id)} className="w-full px-5 py-4 flex items-center justify-between text-left hover:opacity-80 transition-opacity">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-lg">{STATUS_EMOJI[s.status] || '📄'}</span>
                  <div className="min-w-0">
                    <span className="font-mono [color:var(--gold-primary)]">{s.slip_ref}</span>
                    <span className="text-sm ml-3 truncate inline-block align-middle max-w-[40vw] [color:var(--muted-gray)]">
                      {s.username} • {drawLabel(s) || `${s.type_name_th} • ${s.draw_code}`}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-bold [color:var(--white)]">{satang(s.total_stake)} บาท</span>
                  {s.total_payout > 0 && <span className="text-sm ml-2 [color:var(--success-green)]">จ่าย {satang(s.total_payout)} บาท</span>}
                  {settled && (
                    <span className="text-sm ml-2 font-semibold" style={{ color: houseNet >= 0 ? 'var(--success-green)' : 'var(--danger-red)' }}>
                      ระบบ {houseNet >= 0 ? '+' : ''}{satang(houseNet)} บาท
                    </span>
                  )}
                  <span className={cn('text-[10px] font-semibold shrink-0 px-2 py-0.5 rounded-full border',
                    s.status === 'won' ? 'luxury-badge-success'
                    : s.status === 'partial' ? 'luxury-badge-gold'
                    : s.status === 'pending' ? 'luxury-badge-info'
                    : s.status === 'cancelled' || s.status === 'refunded' ? 'luxury-badge'
                    : 'luxury-badge-danger')}>
                    {STATUS_TH[s.status] || s.status}
                  </span>
                  <div className="[color:var(--dark-gray)] [font-size:11px] [margin-top:2px]">{fmtDateTime(s.created_at)}</div>
                </div>
              </button>
              {open === s.id && (
                <div className="px-5 py-4 space-y-2 [border-top:1px_solid_var(--border-light)]">
                  {(Array.isArray(s.items) ? s.items : []).map(i => <ItemRow key={i.id} i={i} />)}
                </div>
              )}
            </div>
          );
        })}
        {!filtered.length && <div className="text-center py-10 [color:var(--muted-gray)]">{total ? 'ไม่พบโพยที่ตรงกับเงื่อนไข' : 'ไม่มีโพย'}</div>}
      </div>
      <TablePager page={curPage} pageCount={pageCount} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />
    </div>
  );
}
