import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/shadcn/dialog.jsx';
import { Input } from '../components/shadcn/input.jsx';
import { Icon } from '../components/icons.jsx';
import { useAuth } from '../auth.jsx';
import { adminGroups } from './navConfig.js';

// quick actions — จุดที่ใช้บ่อยนอกเหนือจากเมนู nav (filter ด้วย perm เหมือน nav)
const ACTIONS = [
  { to: '/admin', label: 'ภาพรวม', icon: 'dashboard', perm: 'dashboard.admin', hint: 'หน้าหลักผู้ดูแล' },
  { to: '/admin/lotteries?tab=settle', label: 'ออกผลรางวัล', icon: 'draws', perm: 'lottery.manage', hint: 'ประกาศผลรอบหวย' },
  { to: '/admin/settings', label: 'ตั้งค่าระบบ', icon: 'settings', perm: 'settings.manage', hint: 'การตั้งค่าทั่วไป' },
];

export default function CommandPalette({ open, onOpenChange }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef(null);

  const perms = useMemo(() => user?.permissions || [], [user?.permissions]);
  const hasPerm = (p) => !p || perms.includes(p) || perms.includes('*');

  // รวม nav items (group ตาม sidebar) + quick actions — filter ตามสิทธิ์ + คำค้น (includes บน label)
  const { sections, flat } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (label) => !q || label.toLowerCase().includes(q);
    const flat = [];
    const push = (item, group) => {
      const entry = { ...item, group, idx: flat.length };
      flat.push(entry);
      return entry;
    };
    const sections = [];

    const actionItems = ACTIONS.filter(a => hasPerm(a.perm) && match(a.label));
    if (actionItems.length) {
      const sec = { label: 'คำสั่งด่วน', items: [] };
      actionItems.forEach(a => sec.items.push(push(a, sec.label)));
      sections.push(sec);
    }

    for (const g of adminGroups) {
      const items = g.items.filter(i => hasPerm(i.perm) && match(i.label));
      if (!items.length) continue;
      const sec = { label: g.label, items: [] };
      items.forEach(i => sec.items.push(push(i, sec.label)));
      sections.push(sec);
    }
    return { sections, flat };
  }, [query, perms]);

  // reset ตอนเปิด palette + clamp index เมื่อรายการเปลี่ยน
  useEffect(() => {
    if (open) { setQuery(''); setActive(0); }
  }, [open]);
  const sel = Math.min(active, Math.max(flat.length - 1, 0));

  // scroll รายการที่เลือกมาไว้ในจอ (input focus ให้ Radix Dialog จัดการ + autoFocus)
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [sel, query, open]);

  const go = (item) => {
    if (!item) return;
    onOpenChange(false);
    navigate(item.to);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(flat[sel]); }
    // Esc ปิดโดย Dialog (Radix) ให้อัตโนมัติ
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onKeyDown={onKeyDown}
        className="sm:max-w-xl gap-0 p-0 overflow-hidden border-[var(--border-gold)] bg-[var(--bg-card)] shadow-[var(--shadow-pop)]">
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-[var(--border-light)]">
          <DialogTitle className="font-display font-bold text-base text-[var(--white)]">ค้นหาเมนูผู้ดูแล</DialogTitle>
          <DialogDescription className="sr-only">พิมพ์เพื่อค้นหาและกด Enter เพื่อไปยังหน้านั้น — ใช้ลูกศรขึ้นลงเพื่อเลือก</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border-light)]">
          <Icon name="search" className="w-4 h-4 shrink-0 text-[var(--muted-gray)]" />
          <Input
            autoFocus
            value={query}
            onChange={e => { setQuery(e.target.value); setActive(0); }}
            placeholder="ค้นหา เช่น สมาชิก, รอบหวย, ตั้งค่า…"
            className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 text-[var(--white)] placeholder:text-[var(--muted-gray)]"
          />
          <kbd className="hidden sm:inline-flex shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border border-[var(--border-light)] text-[var(--muted-gray)]">ESC</kbd>
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
          {flat.length === 0 && (
            <div className="px-3 py-6 text-center text-[13px] text-[var(--muted-gray)]">ไม่พบรายการที่ตรงกับ “{query}”</div>
          )}
          {sections.map(sec => (
            <div key={sec.label}>
              <div className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted-gray)]">{sec.label}</div>
              {sec.items.map(i => (
                <button
                  key={i.idx}
                  type="button"
                  data-idx={i.idx}
                  data-active={i.idx === sel}
                  onMouseEnter={() => setActive(i.idx)}
                  onClick={() => go(i)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors ${i.idx === sel
                    ? 'bg-[rgba(212,175,55,0.15)] text-[var(--gold-bright)] font-semibold'
                    : 'text-[var(--white)]/80 hover:bg-[var(--bg-dark-surface)]'}`}>
                  <Icon name={i.icon} className="w-4 h-4 shrink-0" />
                  <span className="truncate">{i.label}</span>
                  {i.hint && <span className="ml-auto truncate text-[11px] font-normal text-[var(--muted-gray)]">{i.hint}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 px-4 py-2 border-t border-[var(--border-light)] text-[10px] text-[var(--muted-gray)]">
          <span>↑↓ เลือก</span><span>Enter ไป</span><span>Esc ปิด</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
