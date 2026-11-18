import { useEffect, useState } from 'react';
import { api, satang, fmtDateTime } from '../api.js';
import { resultSchema } from '../lotterySchema.js';
import { confirmAction } from './confirm.jsx';
import { toast } from '../components/toast.js';
import { FlagIcon } from '../components/ResultLine.jsx';
import { sourceBadge } from '../resultSource.js';
import { Button, Card, Select } from '../components/ui/index.js';

// 12 ปีนักษัตรไทย — ต้องตรงกับ server/src/lib/zodiac.js
const ZODIAC = ['ชวด', 'ฉลู', 'ขาล', 'เถาะ', 'มะโรง', 'มะเส็ง', 'มะเมีย', 'มะแม', 'วอก', 'ระกา', 'จอ', 'กุน'];
const normZodiac = (s) => String(s || '').trim().replace(/^(ปี|ราศี)/, '');

const ZodiacSelect = ({ value, onChange }) => (
  <select value={value} onChange={e => onChange(e.target.value)}
    className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 text-xl text-center text-gold-300 mt-1">
    <option value="">— เลือกปีนักษัตร —</option>
    {ZODIAC.map(z => <option key={z} value={z}>{z}</option>)}
  </select>
);

// field ที่มีหลายรางวัล → ช่องแยก 1 ช่องต่อรางวัล (digits หลักพอดี ไม่ต้องพิมพ์ comma)
const PrizeInputs = ({ f, value, onChange }) => {
  const cur = Array.isArray(value) ? value
    : String(value || '').split(/[\s,]+/).map(x => x.trim());
  const arr = Array.from({ length: f.prizes }, (_, i) => cur[i] || '');
  const set = (i, v) => {
    const next = [...arr];
    next[i] = v.replace(/\D/g, '').slice(0, f.digits);
    onChange(next);
  };
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${f.prizes}, minmax(0,1fr))` }}>
      {arr.map((p, i) => (
        <input key={i} value={p} inputMode="numeric" maxLength={f.digits}
          onChange={e => set(i, e.target.value)}
          placeholder={'0'.repeat(f.digits)}
          className="w-full bg-navy-900 border border-navy-600 rounded-lg px-2 py-3 text-xl font-mono text-center text-gold-300" />
      ))}
    </div>
  );
};

// format hint แสดงใต้ช่องกรอก — บอก syntax ที่ต้องกรอกของ field นั้น
const fieldHint = (f) => {
  if (f.set5) return '5 เลขไม่ซ้ำ ในช่วง 1-45 คั่นด้วย comma';
  if (f.seq) return 'ปีนักษัตร 6 ตัวคั่นด้วย - เช่น ขาล-เถาะ-มะโรง';
  if (f.zodiac) return 'เลือกปีนักษัตรจาก dropdown';
  if (f.prizes > 1) return `เลข ${f.digits} หลัก จำนวน ${f.prizes} รางวัล คั่นด้วย comma เช่น ${Array(f.prizes).fill('0'.repeat(f.digits)).join(', ')}`;
  return `ต้องเป็นตัวเลข ${f.digits} หลักเท่านั้น`;
};
// จำกัดความยาว input ตาม format จริง (เลข×จำนวนรางวัล + ช่องว่าง/comma)
const fieldMaxLen = (f) => f.set5 ? 40 : (f.prizes > 1 ? f.digits * f.prizes + f.prizes * 2 : f.digits);

// แปลงค่าที่กรอกใน field เดียว → {value} | {empty} | {error}
const parseField = (f, t) => {
  const s = String(t || '').trim();
  if (!s) return { empty: true };
  if (f.set5) {
    const nums = s.split(/[\s,\-]+/).map(x => x.trim()).filter(Boolean);
    const ok = nums.length === 5 && nums.every(x => /^\d{1,2}$/.test(x))
      && nums.every(x => { const n = +x; return n >= 1 && n <= 45; })
      && new Set(nums.map(Number)).size === 5;
    return ok ? { value: nums }
      : { error: 'เลขที่ออกต้องเป็นตัวเลขไม่ซ้ำ 5 ตัว ในช่วง 1-45 (คั่นด้วย comma)' };
  }
  if (f.seq) {
    const arr = s.split('-').map(x => normZodiac(x)).filter(Boolean);
    return (arr.length === 6 && arr.every(x => ZODIAC.includes(x)))
      ? { value: arr }
      : { error: 'เลขรางวัล 6 ปีนักษัตรต้องเป็นปีนักษัตร 6 ตัวคั่นด้วย - เช่น ขาล-เถาะ-มะโรง-มะเส็ง-มะเมีย-มะแม' };
  }
  const parts = s.split(/[\s,]+/).map(x => x.trim()).filter(Boolean);
  const expected = f.prizes && f.prizes > 1 ? f.prizes : 1;
  const toVal = (x) => {
    if (f.zodiac) {
      const z = normZodiac(x);
      if (!ZODIAC.includes(z)) throw new Error(`${f.label} ต้องเป็นปีนักษัตรที่ถูกต้อง`);
      return z;
    }
    if (!new RegExp(`^\\d{${f.digits}}$`).test(x)) throw new Error(`${f.label} ต้องเป็นตัวเลข ${f.digits} หลัก`);
    return x;
  };
  try {
    if (expected > 1) {
      if (parts.length !== expected)
        return { error: `${f.label} ต้องกรอก ${expected} รางวัล (คั่นด้วย comma) — ตอนนี้ได้ ${parts.length} เลข` };
      return { value: parts.map(toVal) };
    }
    if (parts.length !== 1) return { error: `${f.label} ต้องเป็นตัวเลข ${f.digits} หลักตัวเดียว` };
    return { value: toVal(parts[0]) };
  } catch (e) { return { error: e.message }; }
};

// สร้าง winning_numbers จากช่องกรอก — requireAll=false (แก้ผลย้อนหลัง) ข้าม field ว่างได้
const buildWinning = (useFields, useSchema, requireAll = true) => {
  const winning = {};
  for (const f of useSchema?.fields || []) {
    const r = parseField(f, useFields?.[f.key]);
    if (r.error) return { error: r.error };
    if (r.empty) {
      if (requireAll && !f.optional) return { error: `กรุณากรอกผล "${f.label}" ให้ครบทุกประเภทรางวัล` };
      continue;
    }
    winning[f.key] = r.value;
  }
  for (const [k, v] of Object.entries(useFields || {})) {
    if (winning[k] !== undefined || useSchema?.fields?.some(f => f.key === k)) continue;
    const parts = String(v || '').split(/[\s,]+/).map(x => x.trim()).filter(Boolean);
    if (!parts.length) continue;
    if (!parts.every(x => /^\d{1,10}$/.test(x))) return { error: `field "${k}" ต้องเป็นตัวเลข` };
    winning[k] = parts.length > 1 ? parts : parts[0];
  }
  if (!Object.keys(winning).length) return { error: 'กรุณากรอกผลรางวัลอย่างน้อย 1 รายการ' };
  return { winning };
};

export default function AdminSettle() {
  const [draws, setDraws] = useState([]);
  const [sel, setSel] = useState(null);
  const [selDraw, setSelDraw] = useState(null);
  const [schema, setSchema] = useState(null);
  const [fields, setFields] = useState({});   // key -> string (หลายรางวัลคั่นด้วย comma)
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [editSel, setEditSel] = useState(null);      // draw id สำหรับแก้ผลย้อนหลัง
  const [editDraw, setEditDraw] = useState(null);
  const [editFields, setEditFields] = useState({});
  const [editMsg, setEditMsg] = useState('');
  const [autoMsg, setAutoMsg] = useState('');
  const [autoSources, setAutoSources] = useState([]); // [{code,label,ok,error}]
  const [autoBusy, setAutoBusy] = useState(false);

  const [statusRows, setStatusRows] = useState([]);
  const load = () => {
    api('/admin/draws').then(r => setDraws(r.draws)).catch(e => toast(e.message, 'error'));
    api('/admin/results/status').then(r => setStatusRows(r.status || [])).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  // สั่งระบบตรวจสอบ+ออกผลทุกผลที่ถึงเวลาแล้วทันที (ไม่ต้องรอ scheduler 15 นาที)
  const runAutoSettle = async () => {
    setAutoBusy(true); setAutoMsg(''); setAutoSources([]);
    try {
      const r = await api('/admin/draws/auto-settle', { method: 'POST', body: {} });
      setAutoSources(r.sources || []);
      const parts = [];
      if (r.settled?.length) parts.push(`ออกผลแล้ว ${r.settled.length} รอบ: ${r.settled.join(', ')}`);
      if (r.skipped?.length) parts.push(`ข้าม ${r.skipped.length} รอบ`);
      if (r.errors?.length) parts.push(`error ${r.errors.length}: ${r.errors.join(' | ')}`);
      setAutoMsg(parts.length ? parts.join(' • ') : 'ไม่มีรอบที่ถึงเวลาออกผลในขณะนี้');
      load();
    } catch (e) { setAutoMsg('ERROR: ' + e.message); }
    finally { setAutoBusy(false); }
  };

  // เกมด่วน (ขูด/ไฮโล) เป็น standing draw ไม่มีผลออกรางวัล — ไม่ควรอยู่ในรายการกรอกผล
  const isInstantType = (d) => ['SC', 'HL', 'KI'].includes(d.type_code);
  const unsettled = draws.filter(d => d.status !== 'settled' && d.status !== 'cancelled' && !isInstantType(d));
  const settled = draws.filter(d => d.status === 'settled');
  // "รอบล่าสุด" = ออกรางวัลวันนี้ (เวลาไทย) หรือค้างไม่เกิน 48 ชม. — รอบวันถัดไปและค้างเก่าไปส่วนล่าง
  const drawMs = (s) => new Date(String(s).replace(' ', 'T') + 'Z').getTime();
  const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' }); // YYYY-MM-DD เวลาไทย
  const latestUnsettled = unsettled
    .filter(d => String(d.draw_at).slice(0, 10) <= todayStr && drawMs(d.draw_at) >= Date.now() - 48 * 3600e3)
    .sort((a, b) => String(a.draw_at).localeCompare(String(b.draw_at)));
  const otherUnsettled = unsettled.filter(d => !latestUnsettled.includes(d));
  const overdueUnsettled = otherUnsettled.filter(d => drawMs(d.draw_at) < Date.now() - 48 * 3600e3);
  const upcomingUnsettled = otherUnsettled.filter(d => !overdueUnsettled.includes(d));
  const optLabel = d => `${d.draw_code} (${d.type_name_th}${d.category_name_th ? ' — ' + d.category_name_th : ''}) — ${d.result_mode === 'manual' ? 'กรอกเอง' : 'อัตโนมัติ'}`;

  // เติมค่าลงช่องกรอกจาก winning_numbers object
  const fillFields = (wn, setter) => {
    const o = {};
    for (const [k, v] of Object.entries(wn || {})) o[k] = Array.isArray(v) ? v.join(', ') : String(v);
    setter(o);
  };

  useEffect(() => {
    setFields({}); setSchema(null); setResult(null); setErr('');
    if (!sel) { setSelDraw(null); return; }
    const d = draws.find(x => x.id === sel);
    setSelDraw(d);
    setSchema(resultSchema(d?.type_code, d?.category_code));
  }, [sel, draws]);

  // ดึงผลอัตโนมัติจาก source chain (ไทย=GLO→lotterychecks, ฮานอย=XSMB→lotterychecks) มาเติมในฟอร์มให้ตรวจก่อน settle
  const fetchAuto = async () => {
    setErr(''); setResult(null);
    try {
      const r = await api(`/admin/draws/${sel}/fetch-result`, { method: 'POST', body: {} });
      fillFields(r.winning, setFields);
      setErr('');
      toast(`ดึงผลสำเร็จจาก ${r.source || '-'} (วันที่ ${r.date || '-'}) — ตรวจสอบแล้วกดยืนยันออกผล`, 'success');
    } catch (e) { setErr(e.message); }
  };

  const settle = async (target = null) => {
    setErr(''); setResult(null);
    const useSel = target?.id ?? sel;
    const useSchema = target?.schema ?? schema;
    const useFields = target?.fields ?? fields;
    const useDraw = target?.draw ?? selDraw;
    const { winning, error: winErr } = buildWinning(useFields, useSchema, true);
    if (winErr) return setErr(winErr);
    // จำลองผลก่อนยืนยัน — แสดงสถิติโพยที่จะถูกตรวจ/ถูกรางวัล/ยอดจ่ายรวม
    let preview = null;
    try {
      preview = await api(`/admin/draws/${useSel}/settle-preview`, { method: 'POST', body: { winning_numbers: winning } });
    } catch { /* preview ไม่ได้ไม่เป็นไร — settle ต่อได้ */ }
    const previewText = preview
      ? `\nสรุปก่อนออกผล: ตรวจ ${preview.evaluated ?? preview.pending} โพย • ถูกรางวัล ${preview.winningItems} • จ่ายรวม ${satang(preview.totalPayout)} บาท`
      : '';
    if (!(await confirmAction({
      title: '⚠️ ยืนยันออกผลรางวัล',
      message: `ยืนยันออกผลรางวัลและจ่ายเครดิตโพยอัตโนมัติ?\n${useDraw?.draw_code || ''}${previewText}\nการกระทำนี้ไม่สามารถย้อนกลับได้`,
      danger: true, confirmLabel: 'ยืนยันออกผล',
    }))) return;
    try {
      const r = await api(`/admin/draws/${useSel}/settle`, { method: 'POST', body: { winning_numbers: winning } });
      setResult(r); load();
      if (target) setErr(`ออกผลย้อนหลังสำเร็จ: ตรวจ ${r.settledItems} รายการ • ถูกรางวัล ${r.winningItems} รายการ • จ่ายรวม ${satang(r.totalPayout)} บาท`);
    } catch (e) { setErr(e.message); }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold text-white">ออกผลรางวัล & คำนวณโพย</h1>
      <div className="bg-yellow-500/10 border border-yellow-500/40 text-yellow-300 text-sm rounded-lg p-3">
        ระบบจะ settle โพยทั้งหมดของรอบนั้นอัตโนมัติและจ่ายเครดิตรางวัลตามกติกา — ช่องกรอกผลอ้างอิงตามโครงสร้างรางวัลจริงของประเทศนั้น ๆ
      </div>
      <Card className="p-4 flex flex-wrap items-center gap-3">
        <Button variant="success" onClick={runAutoSettle} disabled={autoBusy}>
          {autoBusy ? 'กำลังตรวจสอบ...' : '⚡ ตรวจผลอัตโนมัติทั้งหมดตอนนี้'}
        </Button>
        <span className="text-xs text-navy-400">ออกผลทุกประเภทที่ตั้งเป็น "อัตโนมัติ" และถึงเวลาแล้วทันที — ไม่ต้องรอรอบเช็ค 60 วินาที</span>
        {autoSources.length > 0 && (
          <div className="w-full flex flex-wrap items-center gap-2 mt-1">
            <span className="text-xs text-navy-400">สถานะการดึงผล:</span>
            {autoSources.map(s => (
              <span key={s.code} title={s.error || 'ดึงข้อมูลสำเร็จ'}
                className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${s.ok ? 'bg-green-500/10 border-green-500/40 text-green-300' : 'bg-red-500/10 border-red-500/40 text-red-300'}`}>
                <FlagIcon code={String(s.code || s.label || '').split('(')[0]} className="w-4 h-3" />
                {s.label} {s.ok ? '✓' : '✗'}
              </span>
            ))}
          </div>
        )}
        {autoMsg && <div className={`w-full text-xs mt-1 ${autoMsg.startsWith('ERROR') ? 'text-red-400' : 'text-green-300'}`}>{autoMsg}</div>}
      </Card>

      {/* สถานะการอัปเดตผลรางวัล — ล่าสุดของทุกประเภท/หมวด */}
      {statusRows.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-white text-sm">สถานะการอัปเดตผลรางวัล</h2>
            <Button variant="ghost" size="sm" onClick={load}>รีเฟรช</Button>
          </div>
          <div className="space-y-1.5">
            {statusRows.map(r => (
              <div key={`${r.type_id}-${r.cat_key}`} className="flex items-center gap-3 bg-navy-900/60 rounded-lg px-3 py-2">
                <FlagIcon code={r.type_code} className="w-8 h-6 text-[9px] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white font-medium truncate">
                    {r.type_name_th}{r.cat_name_th ? <span className="text-navy-300 text-xs"> — {r.cat_name_th}</span> : null}
                  </div>
                  <div className="text-[11px] text-navy-400 truncate">
                    {r.published_at
                      ? <>ล่าสุด: <span className="text-navy-200 font-mono">{fmtDateTime(r.published_at)}</span> • {r.draw_code} • {(() => { const b = sourceBadge(r.source); return b ? `${b.short} (${r.source})` : '⚡ อัตโนมัติ'; })()}</>
                      : 'ยังไม่มีผลรางวัล'}
                  </div>
                </div>
                <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full border ${r.published_at ? 'bg-green-500/15 border-green-500/40 text-green-300' : 'bg-navy-700 border-navy-600 text-navy-300'}`}>
                  {r.published_at ? 'อัปเดตแล้ว' : 'ยังไม่มีผล'}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card className="p-5 space-y-4">
        <div>
          <label className="text-sm text-navy-300">เลือกรอบหวย</label>
          <Select value={sel || ''} onChange={e => setSel(e.target.value ? Number(e.target.value) : null)} className="mt-1">
            <option value="">— เลือกรอบ —</option>
            {latestUnsettled.length > 0 && (
              <optgroup label={`รอบล่าสุด (${latestUnsettled.length})`}>
                {latestUnsettled.map(d => <option key={d.id} value={d.id}>{optLabel(d)} — {d.status}</option>)}
              </optgroup>
            )}
            {overdueUnsettled.length > 0 && (
              <optgroup label={`ค้างเก่า เกิน 48 ชม. (${overdueUnsettled.length})`}>
                {overdueUnsettled.map(d => <option key={d.id} value={d.id}>{optLabel(d)}</option>)}
              </optgroup>
            )}
            {upcomingUnsettled.length > 0 && (
              <optgroup label={`รอบล่วงหน้า (${upcomingUnsettled.length})`}>
                {upcomingUnsettled.map(d => <option key={d.id} value={d.id}>{optLabel(d)}</option>)}
              </optgroup>
            )}
          </Select>
          {!unsettled.length && (
            <p className="text-xs text-navy-400 mt-1">ไม่มีรอบที่รอออกผล — ทุกรอบออกผลครบแล้ว</p>
          )}
          {selDraw && (
            <p className="text-xs text-navy-300 mt-2">
              รอบที่เลือก: <span className="text-white font-semibold">{selDraw.draw_code}</span>
              {' '}• ออกรางวัล {fmtDateTime(selDraw.draw_at)} • ปิดรับ {fmtDateTime(selDraw.close_at)} • สถานะ {selDraw.status}
            </p>
          )}
        </div>
        {sel && selDraw && schema && (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              {schema.fields.map(f => (
                <div key={f.key}>
                  <label className="text-sm text-navy-300">
                    {f.label}
                    {f.prizes > 1 && <span className="text-gold-400"> ({f.prizes} รางวัล)</span>}
                    {f.optional && <span className="text-navy-500 text-xs"> (ไม่บังคับ)</span>}
                  </label>
                  {f.zodiac ? (
                    <ZodiacSelect value={fields[f.key] || ''} onChange={v => setFields({ ...fields, [f.key]: v })} />
                  ) : f.seq ? (
                    <input value={fields[f.key] || ''}
                      onChange={e => setFields({ ...fields, [f.key]: e.target.value })}
                      className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 text-xl font-mono text-center text-gold-300 mt-1"
                      placeholder="ชวด-ฉลู-ขาล-เถาะ-มะโรง-มะเส็ง" />
                  ) : f.prizes > 1 && !f.set5 ? (
                    <div className="mt-1"><PrizeInputs f={f} value={fields[f.key]} onChange={v => setFields({ ...fields, [f.key]: v })} /></div>
                  ) : f.set5 ? (
                    <input value={fields[f.key] || ''}
                      onChange={e => setFields({ ...fields, [f.key]: e.target.value.replace(/[^\d,\s\-]/g, '').slice(0, 40) })}
                      inputMode="numeric"
                      className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 text-xl font-mono text-center text-gold-300 mt-1"
                      placeholder="เช่น 12, 7, 34, 19, 45" />
                  ) : (
                  <input value={fields[f.key] || ''}
                    onChange={e => setFields({...fields, [f.key]: e.target.value.replace(/\D/g, '').slice(0, f.digits)})}
                    inputMode="numeric" maxLength={f.digits}
                    className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 text-xl font-mono text-center text-gold-300 mt-1"
                    placeholder={'0'.repeat(f.digits)} />
                  )}
                  <p className="text-[11px] text-navy-500 mt-1">{fieldHint(f)}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-navy-400">
              {schema.fields.some(f => f.prizes > 1) && 'รางวัลที่มีหลายเลข ให้คั่นด้วย comma เช่น 12, 34, 56 • '}
              ผลจะถูกบันทึกและหัก/จ่ายเครดิตโพยทั้งหมดในรอบนี้ทันที
            </p>
            {err && <div className="text-red-400 text-sm">{err}</div>}
            {result && (
              <div className="bg-green-500/10 border border-green-500/40 rounded-lg p-4 text-sm text-green-300">
                ออกผลสำเร็จ: ตรวจ {result.settledItems} รายการ • ถูกรางวัล {result.winningItems} รายการ • จ่ายรวม {satang(result.totalPayout)} บาท
              </div>
            )}
            {selDraw?.result_mode === 'manual' && (
              <div className="bg-amber-500/10 border border-amber-500/40 text-amber-300 text-sm rounded-lg p-3">
                ✏️ ประเภทนี้ตั้งเป็น <b>กรอกผลเอง</b> — กรอกผลตามช่องด้านบนแล้วกดยืนยันออกผล (ระบบจะตรวจสอบกับโพยที่แทงและคำนวณเครดิตทั้งระบบอัตโนมัติ)
              </div>
            )}
            <div className="flex gap-2">
              {selDraw?.result_mode !== 'manual' && (
                <Button variant="success" className="flex-1 !py-3" onClick={fetchAuto}>
                  ดึงผลอัตโนมัติ
                </Button>
              )}
              <Button className="flex-1 !py-3" onClick={() => settle()}>
                ยืนยันออกผลและ settle โพยทั้งหมด
              </Button>
            </div>
          </>
        )}
        {sel && !schema && <div className="text-navy-400 text-sm">ไม่พบโครงสร้างผลรางวัลสำหรับประเภทนี้</div>}
      </Card>

      {/* แก้ไขผลย้อนหลัง — ระบบคิดเครดิต/เดบิตส่วนต่างใหม่ทั้งโพย */}
      <Card className="p-5 space-y-4">
        <h2 className="text-lg font-bold text-white">แก้ไขผลย้อนหลัง (หลังออกผลแล้ว)</h2>
        <p className="text-xs text-navy-400">แก้ตัวเลขผลแล้วระบบจะคำนวณส่วนต่างเครดิต/เดบิตของโพยทั้งหมดในรอบนั้นใหม่โดยอัตโนมัติ</p>
        <Select value={editSel || ''}
          onChange={e => {
            const id = e.target.value ? Number(e.target.value) : null;
            setEditSel(id); setEditMsg(''); setEditFields({});
            const d = settled.find(x => x.id === id);
            setEditDraw(d);
            if (d?.result_numbers) {
              try { fillFields(JSON.parse(d.result_numbers), setEditFields); } catch { /* ignore */ }
            }
          }}
          className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2.5">
          <option value="">— เลือกรอบที่ออกผลแล้ว —</option>
          {settled.map(d => <option key={d.id} value={d.id}>{d.draw_code} ({d.type_name_th}{d.category_name_th ? ' — ' + d.category_name_th : ''}) — {d.result_mode === 'manual' ? 'กรอกเอง' : 'อัตโนมัติ'}</option>)}
        </Select>
        {editDraw && (() => {
          const s = resultSchema(editDraw.type_code, editDraw.category_code);
          if (!s) return <div className="text-navy-400 text-sm">ไม่พบโครงสร้างผลรางวัลสำหรับประเภทนี้</div>;
          const save = async () => {
            setEditMsg('');
            if (!(await confirmAction({
              title: '⚠️ ยืนยันแก้ไขผลย้อนหลัง',
              message: `แก้ไขผลรางวัลของรอบที่ออกผลแล้ว?\nระบบจะคำนวณเครดิตโพยทั้งหมดใหม่`,
              danger: true, confirmLabel: 'ยืนยันแก้ไข',
            }))) return;
            const { winning, error: winErr } = buildWinning(editFields, s, false);
            if (winErr) return setEditMsg(winErr);
            try {
              await api(`/admin/draws/${editSel}/result`, { method: 'POST', body: { winning_numbers: winning } });
              setEditMsg('บันทึกผลแก้ไขสำเร็จ — ระบบปรับเครดิตโพยทั้งหมดแล้ว');
              load();
            } catch (e) { setEditMsg(e.message); }
          };
          return (
            <>
              <div className="grid sm:grid-cols-2 gap-3">
                {s.fields.map(f => (
                  <div key={f.key}>
                    <label className="text-sm text-navy-300">{f.label}{f.prizes > 1 && <span className="text-gold-400"> ({f.prizes} รางวัล)</span>}</label>
                    {f.zodiac ? (
                      <ZodiacSelect value={editFields[f.key] || ''} onChange={v => setEditFields({ ...editFields, [f.key]: v })} />
                    ) : f.seq ? (
                      <input value={editFields[f.key] || ''}
                        onChange={e => setEditFields({ ...editFields, [f.key]: e.target.value })}
                        className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 text-xl font-mono text-center text-gold-300 mt-1"
                        placeholder="ชวด-ฉลู-ขาล-เถาะ-มะโรง-มะเส็ง" />
                    ) : f.prizes > 1 && !f.set5 ? (
                      <div className="mt-1"><PrizeInputs f={f} value={editFields[f.key]} onChange={v => setEditFields({ ...editFields, [f.key]: v })} /></div>
                    ) : f.set5 ? (
                      <input value={editFields[f.key] || ''}
                        onChange={e => setEditFields({ ...editFields, [f.key]: e.target.value.replace(/[^\d,\s\-]/g, '').slice(0, 40) })}
                        inputMode="numeric"
                        className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 text-xl font-mono text-center text-gold-300 mt-1"
                        placeholder="เช่น 12, 7, 34, 19, 45" />
                    ) : (
                    <input value={editFields[f.key] || ''}
                      onChange={e => setEditFields({ ...editFields, [f.key]: e.target.value.replace(/\D/g, '').slice(0, f.digits) })}
                      inputMode="numeric" maxLength={f.digits}
                      className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 text-xl font-mono text-center text-gold-300 mt-1"
                      placeholder={'0'.repeat(f.digits)} />
                    )}
                    <p className="text-[11px] text-navy-500 mt-1">{fieldHint(f)}</p>
                  </div>
                ))}
              </div>
              {editMsg && <div className={`text-sm ${editMsg.includes('สำเร็จ') ? 'text-green-400' : 'text-red-400'}`}>{editMsg}</div>}
              <Button variant="danger" className="w-full !py-3" onClick={save}>
                บันทึกผลแก้ไข
              </Button>
            </>
          );
        })()}

      </Card>
    </div>
  );
}
