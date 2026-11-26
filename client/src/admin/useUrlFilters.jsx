import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

// อ่าน filter values จาก URLSearchParams ตาม defaults — ค่าไม่อยู่ใน URL → ใช้ default
const readFilters = (params, defaults) => {
  const out = {};
  for (const [k, def] of Object.entries(defaults)) {
    const raw = params.get(k);
    if (raw === null) { out[k] = def; continue; }
    if (typeof def === 'number') {
      const n = Number(raw);
      out[k] = Number.isFinite(n) ? n : def;
    } else {
      out[k] = raw;
    }
  }
  return out;
};

// Sync filter state กับ URL query params — refresh / back / share link แล้ว filter ยังอยู่
// defaults: { key: ค่าเริ่มต้น } — ค่าที่เท่ากับ default จะไม่ถูกเขียนลง URL (ลบ key ทิ้ง)
// setFilters(partial) merge กับค่าปัจจุบันใน URL (parse จาก prev — ไม่ stale) แล้วเขียนกลับ
// ใช้ replace navigation — ไม่สร้าง history entry รัวตอนพิมพ์ค้นหา debounce
export function useUrlFilters(defaults) {
  const [params, setParams] = useSearchParams();
  const defaultsKey = JSON.stringify(defaults);
  const parsedDefaults = useMemo(() => JSON.parse(defaultsKey), [defaultsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const filters = useMemo(() => readFilters(params, parsedDefaults), [params, parsedDefaults]);

  const setFilters = (partial) => {
    setParams(prev => {
      const merged = { ...readFilters(prev, parsedDefaults), ...partial };
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(merged)) {
        const def = parsedDefaults[k];
        if (v === undefined || v === null || String(v) === String(def ?? '')) next.delete(k);
        else next.set(k, String(v));
      }
      return next.toString() === prev.toString() ? prev : next;
    }, { replace: true });
  };

  return [filters, setFilters];
}

// แถบ pagination กลางๆ สำหรับตาราง admin — "แสดง X–Y จาก Z" + ปุ่มก่อนหน้า/ถัดไป
export function TablePager({ page, pageCount, total, pageSize = 50, onPage, className = '' }) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const btn = 'luxury-btn-ghost text-sm px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed';
  return (
    <div className={`flex items-center justify-between flex-wrap gap-3 ${className}`}>
      <span className="[color:var(--muted-gray)] [font-size:12px]">
        แสดง {from.toLocaleString()}–{to.toLocaleString()} จาก {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={btn}>‹ ก่อนหน้า</button>
        <span className="[color:var(--muted-gray)] [font-size:12px] whitespace-nowrap">หน้า {page} / {pageCount}</span>
        <button type="button" disabled={page >= pageCount} onClick={() => onPage(page + 1)} className={btn}>ถัดไป ›</button>
      </div>
    </div>
  );
}
