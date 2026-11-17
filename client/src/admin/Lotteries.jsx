import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { confirmAction } from './confirm.jsx';
import { resultSchema } from '../lotterySchema.js';
import { marketInfo, MODE_BADGE, isOfficial } from '../resultSource.js';
import { FlagIcon } from '../components/ResultLine.jsx';
import AdminSettle from './Settle.jsx';
import { toast } from '../components/toast.js';
import { Button, Card, Input, Select, Modal } from '../components/ui/index.js';

// แปลง match_config เป็นภาษาคนอ่านง่าย
const SOURCE_TH = {
  first: 'รางวัลที่ 1', front3: 'เลขหน้า 3 ตัว', top3: 'เลขท้าย 3 ตัวบน',
  bottom2: 'เลขท้าย 2 ตัว', last4: 'เลขท้าย 4 ตัว', last3: 'เลขท้าย 3 ตัว',
  last2: 'เลขท้าย 2 ตัว', num4: 'เลข 4 ตัว', top2: 'เลข 2 ตัวบน', main: 'เลขหลัก',
  zodiac: 'ปีนักษัตรรางวัลใหญ่', seq: 'เลขรางวัล 6 ปีนักษัตร', hilo: 'เต๋าไฮโล',
};
const MODE_TH = {
  exact: 'ตรงกันเป๊ะ', sorted: 'โต๊ด (สลับหลักได้)', digit_contains: 'วิ่ง (มีเลขนั้น)',
  tail: 'เทียบท้าย', head: 'เทียบหน้า', seq_tail: 'ปีนักษัตรท้ายตามลำดับ', contains: 'ปีนักษัตรอยู่ในผล',
  hilo: 'ไฮโล 3 ลูก', scratch: 'ขูดสล็อต 5 รีล',
};
function matchLabel(cfg) {
  try {
    const c = JSON.parse(cfg);
    const mode = MODE_TH[c.mode] || c.mode;
    const src = c.source ? (SOURCE_TH[c.source] || c.source) : null;
    return src ? `${src} • ${mode}` : String(mode);
  } catch { return cfg; }
}

// กติกาเกมด่วนที่ผูกกับ service จริง — ให้แก้ match_config ได้แม้ตอน edit
const INSTANT_BET_TYPES = ['scratch', 'hilo', 'hilo_low', 'hilo_high', 'hilo_eleven', 'kiwi', 'kiwi_vip', 'kiwi_dice'];

// ค่า default อัตราจ่ายเกมด่วน — ใช้แสดงในฟอร์มเมื่อยังไม่เคยปรับ (ตรงกับ server)
const SCRATCH_DEFAULT_PRIZES = [
  { icon: '🍒', name: 'เชอร์รี่', prize: 150 }, { icon: '🍋', name: 'เลมอน', prize: 300 },
  { icon: '🍊', name: 'ส้ม', prize: 500 },     { icon: '🍇', name: 'องุ่น', prize: 900 },
  { icon: '🔔', name: 'กระดิ่ง', prize: 2000 }, { icon: '⭐', name: 'ดาว', prize: 6000 },
  { icon: '💎', name: 'เพชร', prize: 18000 },  { icon: '7️⃣', name: 'เจ็ด', prize: 80000 },
];
const KIWI_TIER_HITS = { kiwi: [2, 3, 4, 5], kiwi_vip: [2, 3] };
const KIWI_TIER_DEFAULTS = { kiwi: { 2: 1, 3: 4, 4: 18, 5: 70 }, kiwi_vip: { 2: 4, 3: 30 } };
const DICE_MULT_DEFAULTS = { single: 1.6, pair: 5, triple: 150 };
const DICE_BET_LABEL = { single: 'สัตว์เดี่ยว', pair: 'สัตว์คู่', triple: 'สัตว์ตอง' };
// ประเภทที่มีตัวแก้ JSON เฉพาะทาง (prizes/payouts) — ซ่อนช่อง match_config ดิบกันแก้ชนกัน
const STRUCTURED_CFG_TYPES = ['scratch', 'kiwi', 'kiwi_vip', 'kiwi_dice'];
const parseCfg = (s) => { try { return JSON.parse(s || '{}') || {}; } catch { return {}; } };

// แหล่งผล (source) ที่ใช้ได้จริงต่อประเภทหวย — ตรงกับ winning_numbers ที่ resultFetcher สร้าง
const CFG_SOURCES = {
  TH:  ['first', 'front3', 'top3', 'bottom2'],
  LA:  ['last4', 'last3', 'last2', 'bottom2', 'num4', 'top3'],
  HN:  ['num4', 'top3', 'top2', 'bottom2'],
  GS:  ['p1', 'p2', 'p3', 'p4', 'p5', 'last4', 'last3'],
  HR:  ['zodiac', 'seq'],
};
const CFG_MODES = ['exact', 'tail', 'head', 'sorted', 'digit_contains', 'seq_tail', 'contains', 'set5'];

// badge สถานะตลาด — ข้อมูลอยู่ใน resultSource.js (MARKET_INFO/MODE_BADGE)
function marketBadge(typeCode, catCode) {
  const info = marketInfo(typeCode, catCode);
  if (!info) return null;
  const b = MODE_BADGE[info.mode];
  const unoff = info.mode === 'auto' && !isOfficial(info);
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap max-w-full overflow-hidden text-ellipsis inline-block align-middle ${b.cls}`}
      title={`ชนิด: ${info.kind} • แหล่งผล: ${info.src}${unoff ? ' • ไม่ใช่ผลทางการ (แหล่งภายนอก)' : ''}`}>
      {info.kind} • {unoff ? '⚠️ ' : ''}{b.label}{info.src && info.mode !== 'off' ? ` (${info.src})` : ''}
    </span>
  );
}

const emptyRule = (typeId) => ({
  lottery_type_id: typeId, category_id: null, bet_type: '', name_th: '', name_en: '',
  digits: 2, match_config: '{"source":"bottom2","mode":"exact"}',
  payout_multiplier: 100, stake_unit: 100, min_amount: 100, max_amount: 1000000, is_active: 1,
});

// หน่วยเงินใน DB เป็นสตางค์ — ฟอร์มแสดง/กรอกเป็นบาท
const toBaht = (satang) => (Number(satang || 0) / 100);
const toSatang = (v) => Math.round((parseFloat(v) || 0) * 100);

export default function AdminLotteries() {
  const [types, setTypes] = useState([]);
  const [rules, setRules] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showInactive, setShowInactive] = useState(false);
  const [showDead, setShowDead] = useState(false); // กติกาที่ถูกแทนที่แล้ว (*_old_*/_retired_) — ซ่อน default กันตารางยาว
  const [ruleQuery, setRuleQuery] = useState('');
  const [lastResults, setLastResults] = useState({});
  const [editRule, setEditRule] = useState(null);
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [typeForm, setTypeForm] = useState({ code: '', name_th: '', name_en: '', description: '' });
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'settle' ? 'settle' : 'rules';
  const setTab = (t) => setParams(t === 'settle' ? { tab: 'settle' } : {});

  const load = () => {
    api('/admin/lottery/types').then(r => setTypes(r.types)).catch(e => toast(e.message, 'error'));
    api('/admin/lottery/rules').then(r => setRules(r.rules)).catch(() => {});
    api('/admin/lottery/categories').then(r => setCategories(r.categories)).catch(() => {});
    api('/admin/lottery/last-results').then(r => {
      const m = {};
      for (const x of r.results || []) m[`${x.lottery_type_id}:${x.category_id ?? 0}`] = x;
      setLastResults(m);
    }).catch(() => {});
  };
  useEffect(load, []);

  const createType = async (e) => {
    e.preventDefault();
    if (!(await confirmAction({ title: 'ยืนยันเพิ่มประเภทหวย', message: `เพิ่มประเภทหวย "${typeForm.name_th}" (${typeForm.code}) ใช่หรือไม่?` }))) return;
    try { await api('/admin/lottery/types', { method: 'POST', body: typeForm }); setShowTypeForm(false); setTypeForm({ code:'', name_th:'', name_en:'', description:'' }); load(); }
    catch (e2) { toast(e2.message, 'error'); }
  };

  const toggleType = async (t) => {
    const enabling = !t.is_active;
    if (!(await confirmAction({
      title: enabling ? 'ยืนยันเปิดประเภทหวย' : '⚠️ ยืนยันปิดประเภทหวย',
      message: `${enabling ? 'เปิด' : 'ปิด'}การใช้งาน "${t.name_th}" ใช่หรือไม่?${enabling ? '' : '\nประเภทที่ปิดจะไม่แสดงให้สมาชิกเห็น'}`,
      danger: !enabling,
    }))) return;
    await api(`/admin/lottery/types/${t.id}`, { method: 'PATCH', body: { is_active: enabling ? 1 : 0 } });
    load();
  };

  const setResultMode = async (t, mode) => {
    if (!(await confirmAction({
      title: 'ยืนยันเปลี่ยนโหมดผลรางวัล',
      message: `ตั้งผลรางวัลของ "${t.name_th}" เป็น "${mode === 'auto' ? 'อัตโนมัติ (ดึงจากแหล่งข้อมูล)' : 'กรอกเองโดย admin'}" ใช่หรือไม่?`,
    }))) return;
    await api(`/admin/lottery/types/${t.id}`, { method: 'PATCH', body: { result_mode: mode } });
    load();
  };

  // patch match_config (เก็บ payouts/prizes ของเกมด่วน) — ใช้ในฟอร์มแก้ไขกติกา
  const patchCfg = (patch) => setEditRule(er => er && ({ ...er, match_config: JSON.stringify({ ...parseCfg(er.match_config), ...patch }) }));
  const setTier = (bt, hits, v) => {
    const c = parseCfg(editRule.match_config);
    const tiers = { ...(c.payouts?.tiers || {}) };
    if (v === '' || v == null) delete tiers[hits]; else tiers[hits] = +v;
    patchCfg({ payouts: { ...(c.payouts || {}), tiers } });
  };
  const setDiceMult = (key, v) => {
    const c = parseCfg(editRule.match_config);
    const mults = { ...(c.payouts?.mults || {}) };
    if (v === '' || v == null) delete mults[key]; else mults[key] = +v;
    patchCfg({ payouts: { ...(c.payouts || {}), mults } });
  };
  const setScratchPrize = (icon, satangVal) => {
    const c = parseCfg(editRule.match_config);
    const cur = Array.isArray(c.prizes) ? c.prizes : [];
    const prizes = SCRATCH_DEFAULT_PRIZES.map(s => ({
      icon: s.icon,
      prize: s.icon === icon ? satangVal : (cur.find(p => p.icon === s.icon)?.prize ?? s.prize),
    }));
    patchCfg({ prizes });
  };

  // export/import กติกาเป็น JSON — backup หรือย้ายไป env อื่น
  const exportRules = async () => {
    try {
      const r = await api('/admin/lottery/rules/export');
      const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `lottery-rules-${new Date().toISOString().slice(0, 10)}.json`;
      a.click(); URL.revokeObjectURL(a.href);
    } catch (e) { toast(e.message, 'error'); }
  };
  const importRules = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!(await confirmAction({
        title: 'ยืนยัน import กติกา',
        message: `นำเข้ากติกาจำนวน ${data.rules?.length || 0} รายการจากไฟล์ "${f.name}" — กติกาที่ตรงกันจะถูกอัปเดต ไม่ตรงจะสร้างใหม่ ใช่หรือไม่?`,
      }))) return;
      const r = await api('/admin/lottery/rules/import', { method: 'POST', body: data });
      toast(`import สำเร็จ — สร้างใหม่ ${r.created}, อัปเดต ${r.updated}, ข้าม ${r.skipped}${r.errors?.length ? `, ผิดพลาด ${r.errors.length}` : ''}`, r.errors?.length ? 'error' : 'success');
      load();
    } catch (e2) { toast(e2.message, 'error'); }
  };

  const saveRule = async () => {
    if (!(await confirmAction({ title: editRule.id ? 'ยืนยันแก้ไขกติกา' : 'ยืนยันเพิ่มกติกา', message: `${editRule.id ? 'บันทึกการแก้ไข' : 'เพิ่ม'}กติกา "${editRule.name_th}" ใช่หรือไม่?` }))) return;
    try {
      const body = { ...editRule, category_id: editRule.category_id || null };
      if (editRule.id) await api(`/admin/lottery/rules/${editRule.id}`, { method: 'PATCH', body });
      else await api('/admin/lottery/rules', { method: 'POST', body });
      setEditRule(null); load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const typeName = (id) => types.find(t => t.id === id)?.name_th || `#${id}`;
  const catName = (id) => categories.find(c => c.id === id)?.name_th || '';
  const typeOf = (id) => types.find(t => t.id === id);
  const isDeadRule = (r) => /_(old|retired)_\d*$|_(old|retired)/.test(r.bet_type || '');
  const liveInactive = rules.filter(r => !r.is_active && !isDeadRule(r));
  const visibleRules = (showInactive ? rules.filter(r => !isDeadRule(r) || showDead) : rules.filter(r => r.is_active && !isDeadRule(r)))
    .filter(r => {
      const q = ruleQuery.trim().toLowerCase();
      if (!q) return true;
      const t = typeOf(r.lottery_type_id);
      const c = categories.find(x => x.id === r.category_id);
      return [r.bet_type, r.name_th, t?.name_th, t?.code, c?.name_th, c?.code]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q));
    });

  // จัดกลุ่ม: ประเภทหวย → หมวด → กติกา
  const sections = types.map(t => {
    const typeRules = visibleRules.filter(r => r.lottery_type_id === t.id);
    if (!typeRules.length) return null;
    const catIds = [...new Set(typeRules.map(r => r.category_id || 0))];
    const groups = catIds.map(cid => ({
      cid: cid || null,
      catCode: cid ? categories.find(c => c.id === cid)?.code : null,
      name: cid ? catName(cid) : 'ทั่วไป (ไม่ระบุหมวด)',
      rows: typeRules.filter(r => (r.category_id || 0) === cid),
    }));
    return { type: t, groups };
  }).filter(Boolean);

  // ผลล่าสุดของตลาด — แสดงสั้นๆ ข้างหัวกลุ่มหมวด (ช่วยเช็คว่า source ในกติกาตรงผลจริงไหม)
  const lastResultText = (type, catId) => {
    const row = lastResults[`${type.id}:${catId || 0}`];
    if (!row) return null;
    let w; try { w = JSON.parse(row.winning_numbers); } catch { return null; }
    if (!w || typeof w !== 'object') return null;
    const s = resultSchema(type.code, catId ? categories.find(c => c.id === catId)?.code : null);
    const fields = s?.fields || [];
    const parts = fields.map(f => {
      const v = w[f.key];
      if (v == null || v === '') return null;
      const disp = Array.isArray(v) ? v.slice(0, 3).map(String).join(' ') + (v.length > 3 ? ` +${v.length - 3}` : '') : String(v);
      return `${f.label} ${disp}`;
    }).filter(Boolean).slice(0, 5);
    if (!parts.length) parts.push(...Object.entries(w).filter(([, v]) => ['string', 'number'].includes(typeof v)).slice(0, 4).map(([k, v]) => `${k}:${v}`));
    return parts.length ? `${row.draw_code} • ${parts.join(' · ')}` : null;
  };

  // ฟิลด์ผลรางวัลที่ admin ต้องกรอกเอง สำหรับประเภทที่ตั้งเป็น "กรอกเอง" (แยกตามหมวดหวย)
  const manualFields = (t) => {
    const cats = categories.filter(c => c.lottery_type_id === t.id);
    const groups = (cats.length ? cats : [null])
      .map(c => {
        const s = resultSchema(t.code, c?.code);
        return s ? { cat: c?.name_th || '', fields: s.fields.filter(f => !f.optional) } : null;
      })
      .filter(Boolean);
    const seen = new Set(); const out = [];
    for (const g of groups) {
      const k = g.fields.map(f => f.key).join(',');
      if (!seen.has(k)) { seen.add(k); out.push(g); }
    }
    return out;
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-navy-700">
        {[{ id: 'rules', label: 'ประเภทหวย & กติกา' }, { id: 'settle', label: 'ออกผลรางวัล' }].map(tb => (
          <button key={tb.id} onClick={() => setTab(tb.id)}
            className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 -mb-px transition ${tab === tb.id ? 'border-gold-500 text-gold-300 bg-navy-800' : 'border-transparent text-navy-300 hover:text-white'}`}>
            {tb.label}
          </button>
        ))}
      </div>
      {tab === 'settle' ? <AdminSettle /> : (<>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-white">ประเภทหวย & กติกา</h1>
        <Button size="sm" onClick={() => setShowTypeForm(!showTypeForm)}>+ เพิ่มประเภทหวย</Button>
      </div>

      {showTypeForm && (
        <Card className="p-5">
        <form onSubmit={createType} className="grid sm:grid-cols-2 gap-3">
          <Input required placeholder="code (เช่น TH)" value={typeForm.code} onChange={e => setTypeForm({...typeForm, code: e.target.value})} />
          <Input required placeholder="ชื่อภาษาไทย" value={typeForm.name_th} onChange={e => setTypeForm({...typeForm, name_th: e.target.value})} />
          <Input placeholder="ชื่อภาษาอังกฤษ" value={typeForm.name_en} onChange={e => setTypeForm({...typeForm, name_en: e.target.value})} />
          <Input placeholder="คำอธิบาย" value={typeForm.description} onChange={e => setTypeForm({...typeForm, description: e.target.value})} />
          <Button type="submit" className="sm:col-span-2">บันทึก</Button>
        </form>
        </Card>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        {types.map(t => (
          <Card key={t.id} className="p-4">
            <div className="flex items-center justify-between">
              <div className="font-bold text-white">{t.name_th} <span className="text-xs text-navy-400">({t.code})</span></div>
              <button onClick={() => toggleType(t)} className={`text-xs px-2 py-1 rounded ${t.is_active ? 'bg-green-500/20 text-green-300' : 'bg-navy-700 text-navy-400'}`}>
                {t.is_active ? 'เปิด' : 'ปิด'}
              </button>
            </div>
            <div className="text-xs text-navy-300 mt-1">{t.description}</div>
            <div className="mt-1.5">{marketBadge(t.code, null)}</div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[11px] text-navy-400">ผลรางวัล:</span>
              <select value={t.result_mode || 'auto'} onChange={e => setResultMode(t, e.target.value)}
                className="bg-navy-900 border border-navy-600 rounded px-2 py-1 text-xs text-gold-300">
                <option value="auto">อัตโนมัติ</option>
                <option value="manual">กรอกเอง</option>
              </select>
            </div>
            {(t.result_mode || 'auto') === 'manual' && (
              <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-200/90">
                <div className="font-semibold text-amber-300 mb-1">✏️ โหมดกรอกผลเอง — admin ต้องกรอกผล:</div>
                {manualFields(t).map((g, i) => (
                  <div key={i} className="leading-relaxed">
                    {g.cat && <span className="text-navy-300">[{g.cat}] </span>}
                    {g.fields.map(f => `${f.label}${f.prizes > 1 ? ` ×${f.prizes} เลข` : ` (${f.digits} หลัก)`}`).join(', ')}
                  </div>
                ))}
                {!manualFields(t).length && <div className="text-navy-400">ไม่พบโครงสร้างผลรางวัลของประเภทนี้</div>}
                <div className="text-navy-400 mt-1">กรอกที่แท็บ "ออกผลรางวัล" ด้านบนของหน้านี้</div>
              </div>
            )}
            <div className="text-xs text-navy-400 mt-2">
              {(() => {
                const rs = rules.filter(r => r.lottery_type_id === t.id && r.is_active);
                if (!rs.length) return 'ยังไม่มีกติกาที่ใช้งาน';
                const byCat = {};
                for (const r of rs) { const n = r.category_id ? catName(r.category_id) : 'ทั่วไป'; byCat[n] = (byCat[n] || 0) + 1; }
                return `${rs.length} กติกา (${Object.entries(byCat).map(([k, v]) => `${k} ${v}`).join(' • ')})`;
              })()}
            </div>
          </Card>
        ))}
      </div>

      {/* กติกา แยกตามประเทศ/หมวดหวย */}
      <div className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold text-white text-lg">กติกาการแทงรายประเทศ/หมวด</h2>
          <div className="flex items-center gap-3 flex-wrap">
            <input value={ruleQuery} onChange={e => setRuleQuery(e.target.value)} placeholder="🔍 ค้นหากติกา (ชื่อ/ประเภท/หมวด)"
              className="bg-navy-900 border border-navy-600 rounded-lg px-3 py-1.5 text-sm w-64 text-white placeholder:text-navy-500" />
            <label className="text-xs text-navy-300 flex items-center gap-1.5">
              <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="accent-gold-500" />
              แสดงที่ปิดใช้งาน ({liveInactive.length})
            </label>
            {showInactive && (
              <label className="text-xs text-navy-400 flex items-center gap-1.5">
                <input type="checkbox" checked={showDead} onChange={e => setShowDead(e.target.checked)} className="accent-navy-400" />
                รวมกติกาที่ถูกแทนที่แล้ว ({rules.filter(r => isDeadRule(r)).length})
              </label>
            )}
            <button onClick={exportRules} className="text-xs px-2.5 py-1.5 rounded-lg border border-navy-600 text-navy-300 hover:border-gold-500/50 hover:text-gold-300">⤓ Export JSON</button>
            <label className="text-xs px-2.5 py-1.5 rounded-lg border border-navy-600 text-navy-300 hover:border-gold-500/50 hover:text-gold-300 cursor-pointer">
              ⤒ Import JSON<input type="file" accept=".json" className="hidden" onChange={importRules} /></label>
            <button onClick={() => setEditRule(emptyRule(types[0]?.id))} className="text-sm text-gold-400 hover:underline">+ เพิ่มกติกา</button>
          </div>
        </div>

        {sections.map(({ type, groups }) => (
          <div key={type.id} className="bg-navy-800 border border-navy-700 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 bg-navy-900/60 border-b border-navy-700 flex items-center gap-2">
              <FlagIcon code={type.code} className="w-7 h-7 text-[10px]" />
              <span className="font-bold text-white">{type.name_th}</span>
              <span className="text-xs text-navy-400">({type.code})</span>
            </div>
            {groups.map(g => (
              <div key={g.cid || 'none'} className={g.cid ? 'border-t border-navy-700/60' : ''}>
                <div className="px-5 py-2 bg-navy-800/60 text-xs font-semibold text-gold-400/90 flex items-center gap-2 flex-wrap">
                  {g.name}
                  {marketBadge(type.code, g.catCode)}
                  {(() => { const lr = lastResultText(type, g.cid); return lr ? (
                    <span className="text-[10px] font-normal text-navy-400 truncate max-w-full" title={`ผลล่าสุด: ${lr}`}>📰 {lr}</span>
                  ) : null; })()}
                  {g.cid && (() => {
                    const cat = categories.find(c => c.id === g.cid);
                    if (!cat) return null;
                    const on = Number(cat.is_active ?? 1) === 1;
                    return (
                      <button onClick={async () => {
                        if (!(await confirmAction({
                          title: on ? '⚠️ ยืนยันปิดตลาด' : 'ยืนยันเปิดตลาด',
                          message: `${on ? 'ปิด' : 'เปิด'}ตลาด "${cat.name_th}" ใช่หรือไม่?${on ? '\nสมาชิกจะไม่เห็นตลาดนี้และแทงไม่ได้ (โพยเก่าไม่กระทบ)' : ''}`,
                          danger: on,
                        }))) return;
                        await api(`/admin/lottery/categories/${cat.id}`, { method: 'PATCH', body: { is_active: on ? 0 : 1 } });
                        load();
                      }}
                        className={`text-[10px] px-2 py-0.5 rounded-full border ${on ? 'border-green-500/50 text-green-300' : 'border-navy-500 text-navy-400'}`}
                        title="เปิด/ปิดตลาดระดับหมวด — ปิดแล้วสมาชิกแทงไม่ได้">
                        {on ? '● เปิดตลาด' : '○ ปิดตลาด'}
                      </button>
                    );
                  })()}
                </div>
                <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className="bg-navy-900/40 text-navy-400 text-xs">
                    <tr>
                      <th className="text-left px-5 py-2">ประเภทการแทง</th>
                      <th className="text-center px-3 py-2">หลัก</th>
                      <th className="text-left px-3 py-2">เทียบกับผลรางวัล</th>
                      <th className="text-right px-3 py-2">จ่าย (เท่า)</th>
                      <th className="text-center px-3 py-2">สถานะ</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-700/50">
                    {g.rows.map(r => (
                      <tr key={r.id} className={`hover:bg-navy-700/30 ${r.is_active ? '' : 'opacity-50'}`}>
                        <td className="px-5 py-2.5">
                          <div className="text-white font-medium">{r.name_th}</div>
                          <code className="text-[10px] text-navy-500">{r.bet_type}</code>
                        </td>
                        <td className="px-3 py-2.5 text-center text-navy-200">{r.bet_type?.startsWith('zodiac') ? (r.digits > 1 ? `${r.digits} ราศี` : 'ราศี') : `${r.digits} หลัก`}</td>
                        <td className="px-3 py-2.5 text-navy-300 text-xs" title={r.match_config}>{matchLabel(r.match_config)}</td>
                        <td className="px-3 py-2.5 text-right text-gold-300 font-semibold">{STRUCTURED_CFG_TYPES.includes(r.bet_type) ? <span className="text-navy-400 text-xs font-normal">ดูในแก้ไข</span> : r.bet_type === 'hilo' ? 'ราคาต่อครั้ง' : `x${r.payout_multiplier}`}</td>
                        <td className="px-3 py-2.5 text-center">
                          <button onClick={async () => {
                            const enabling = !r.is_active;
                            if (!(await confirmAction({
                              title: enabling ? 'ยืนยันเปิดใช้กติกา' : '⚠️ ยืนยันปิดกติกา',
                              message: `${enabling ? 'เปิดใช้' : 'ปิด'}กติกา "${r.name_th}" (${r.bet_type}) ใช่หรือไม่?`,
                              danger: !enabling,
                            }))) return;
                            await api(`/admin/lottery/rules/${r.id}`, { method: 'PATCH', body: { is_active: enabling ? 1 : 0 } }); load();
                          }}
                            className={`text-xs px-2 py-1 rounded ${r.is_active ? 'bg-green-500/20 text-green-300' : 'bg-navy-700 text-navy-400'}`}>
                            {r.is_active ? 'ใช้งาน' : 'ปิด'}
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <button onClick={() => setEditRule({ ...r })} className="text-gold-400 text-xs hover:underline">แก้ไข</button>
                          <button onClick={() => setEditRule({ ...r, id: null, bet_type: `${r.bet_type}_copy`, name_th: `${r.name_th} (สำเนา)` })}
                            className="text-sky-400 text-xs hover:underline ml-2" title="คัดลอกกติกานี้เป็นกติกาใหม่ (เปลี่ยน bet_type ก่อนบันทึก)">⧉ คัดลอก</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            ))}
          </div>
        ))}
        {!sections.length && <div className="text-navy-400 text-sm">ไม่มีกติกาที่ใช้งาน — กด "แสดงที่ปิดใช้งาน" เพื่อดูของเก่า</div>}
      </div>

      <Modal open={!!editRule} onClose={() => setEditRule(null)} wide title={`${editRule?.id ? 'แก้ไข' : 'เพิ่ม'}กติกา`}>
        {editRule && (<>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div><label className="text-navy-300 text-xs">ประเภทหวย</label>
                <select value={editRule.lottery_type_id} disabled={!!editRule.id} onChange={e => setEditRule({...editRule, lottery_type_id: +e.target.value, category_id: null})}
                  className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1">
                  {types.map(t => <option key={t.id} value={t.id}>{t.name_th} ({t.code})</option>)}
                </select></div>
              <div><label className="text-navy-300 text-xs">หมวดหวย (เว้นว่าง = ใช้กับทุกหมวดของประเภทนี้)</label>
                <select value={editRule.category_id || ''} disabled={!!editRule.id} onChange={e => setEditRule({...editRule, category_id: e.target.value ? +e.target.value : null})}
                  className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1">
                  <option value="">— ทั่วไป —</option>
                  {categories.filter(c => c.lottery_type_id === editRule.lottery_type_id).map(c => <option key={c.id} value={c.id}>{c.name_th}</option>)}
                </select></div>
              {/* field เชิงเทคนิค (syntax) แสดงเฉพาะตอนสร้างกติกาใหม่ — ตอนแก้ไขไม่ต้องยุ่ง */}
              {!editRule.id && (
                <>
                  <div><label className="text-navy-300 text-xs">bet_type (รหัสภาษาอังกฤษ)</label>
                    <input value={editRule.bet_type} onChange={e => setEditRule({...editRule, bet_type: e.target.value})} className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1" /></div>
                  <div><label className="text-navy-300 text-xs">ชื่ออังกฤษ</label>
                    <input value={editRule.name_en || ''} onChange={e => setEditRule({...editRule, name_en: e.target.value})} className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1" /></div>
                  <div><label className="text-navy-300 text-xs">จำนวนหลัก/ราศี (0 = ไม่ใช่ตัวเลข)</label>
                    <input type="number" min="0" max="10" value={editRule.digits} onChange={e => setEditRule({...editRule, digits: +e.target.value})} className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1" /></div>
                  <div className="sm:col-span-2"><label className="text-navy-300 text-xs">{`match_config (JSON: {"source":"...","mode":"exact|sorted|digit_contains|tail|head"})`}</label>
                    <input value={editRule.match_config} onChange={e => setEditRule({...editRule, match_config: e.target.value})} className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1 font-mono" /></div>
                  <div><label className="text-navy-300 text-xs">หน่วยเดิมพัน (บาท)</label>
                    <input type="number" step="0.01" value={toBaht(editRule.stake_unit)} onChange={e => setEditRule({...editRule, stake_unit: toSatang(e.target.value)})} className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1" /></div>
                </>
              )}
              {/* game ด่วน (ขูด/ไฮโล): match_config แก้ได้แม้ตอน edit — ใช้เก็บ option เสริมของเกม */}
              {editRule.id && INSTANT_BET_TYPES.includes(editRule.bet_type) && !STRUCTURED_CFG_TYPES.includes(editRule.bet_type) && (
                <div className="sm:col-span-2"><label className="text-navy-300 text-xs">match_config (JSON)</label>
                  <input value={editRule.match_config} onChange={e => setEditRule({...editRule, match_config: e.target.value})} className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1 font-mono" />
                  <div className="text-[10px] text-navy-500 mt-1">เกมด่วน: ราคาอยู่ที่ "ขั้นต่ำ/สูงสุด" ด้านล่าง, อัตราจ่ายอยู่ที่ "อัตราจ่าย" — match_config เป็น option เสริมเท่านั้น</div></div>
              )}
              {/* กติกาหวย (ไม่ใช่เกมด่วน): แก้ source/mode/tod แบบมีโครงสร้าง — กัน JSON พิมพ์ผิด */}
              {editRule.id && !INSTANT_BET_TYPES.includes(editRule.bet_type) && (() => {
                const c = parseCfg(editRule.match_config);
                const tCode = typeOf(editRule.lottery_type_id)?.code;
                const srcs = CFG_SOURCES[tCode] || Object.keys(SOURCE_TH);
                return (
                <div className="sm:col-span-2 rounded-lg border border-navy-700 bg-navy-900/50 p-3">
                  <div className="text-xs font-semibold text-gold-300 mb-2">🎯 เงื่อนไขการตรวจผล (match_config)</div>
                  <div className="grid sm:grid-cols-3 gap-2">
                    <div><label className="text-navy-400 text-[10px]">แหล่งผล (source)</label>
                      <select value={c.source || ''} onChange={e => patchCfg({ source: e.target.value })}
                        className="w-full bg-navy-900 border border-navy-600 rounded px-2 py-1.5 text-xs mt-0.5">
                        {srcs.map(s => <option key={s} value={s}>{SOURCE_TH[s] || s} ({s})</option>)}
                      </select></div>
                    <div><label className="text-navy-400 text-[10px]">โหมดตรวจ (mode)</label>
                      <select value={c.mode || 'exact'} onChange={e => patchCfg({ mode: e.target.value })}
                        className="w-full bg-navy-900 border border-navy-600 rounded px-2 py-1.5 text-xs mt-0.5">
                        {CFG_MODES.map(m => <option key={m} value={m}>{MODE_TH[m] || m} ({m})</option>)}
                      </select></div>
                    <div><label className="text-navy-400 text-[10px]">อัตราโต๊ด (เว้นว่าง = ไม่รับโต๊ด)</label>
                      <input type="number" step="0.5" min="0" value={c.tod ?? ''} placeholder="—"
                        onChange={e => { const v = e.target.value; const nc = { ...c }; if (v === '') delete nc.tod; else nc.tod = +v; setEditRule({ ...editRule, match_config: JSON.stringify(nc) }); }}
                        className="w-full bg-navy-900 border border-navy-600 rounded px-2 py-1.5 text-xs mt-0.5" /></div>
                  </div>
                  <div className="text-[10px] text-navy-500 mt-1.5">แก้แล้วมีผลกับโพยใหม่ทันที — โพยเก่ายังอ้างกติกาเดิม (ไม่ย้อนหลัง)</div>
                </div>);
              })()}
              <div><label className="text-navy-300 text-xs">ชื่อไทย (แสดงให้สมาชิก)</label>
                <input value={editRule.name_th} onChange={e => setEditRule({...editRule, name_th: e.target.value})} className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1" /></div>
              {editRule.bet_type === 'scratch' ? (
                <div className="sm:col-span-2"><label className="text-navy-300 text-xs">ตารางรางวัล — จ่ายเมื่อสัญลักษณ์ซ้ำ 3 รีลบน 1 เพย์ไลน์ (บาท)</label>
                  <div className="grid sm:grid-cols-2 gap-2 mt-1">
                    {(() => {
                      const c = parseCfg(editRule.match_config);
                      const cur = Array.isArray(c.prizes) ? c.prizes : [];
                      return SCRATCH_DEFAULT_PRIZES.map(s => {
                        const v = cur.find(p => p.icon === s.icon)?.prize ?? s.prize;
                        return (
                          <label key={s.icon} className="flex items-center gap-2 bg-navy-900 border border-navy-700 rounded-lg px-2 py-1.5">
                            <span className="text-lg w-7 text-center">{s.icon}</span>
                            <span className="flex-1 text-xs text-navy-300 truncate">{s.name}</span>
                            <input type="number" step="0.01" min="0" value={toBaht(v)}
                              onChange={e => setScratchPrize(s.icon, toSatang(e.target.value))}
                              className="w-20 bg-navy-800 border border-navy-600 rounded px-2 py-1 text-xs text-right" />
                          </label>
                        );
                      });
                    })()}
                  </div>
                  <div className="text-[10px] text-navy-500 mt-1">รางวัล 4/5 รีล = ×4 / ×15 ของค่านี้อัตโนมัติ • ราคาบัตรแก้ที่ขั้นต่ำ/สูงสุดด้านล่าง</div></div>
              ) : ['kiwi', 'kiwi_vip'].includes(editRule.bet_type) ? (
                <div className="sm:col-span-2"><label className="text-navy-300 text-xs">อัตราจ่าย — จ่ายกี่เท่าของราคาเมื่อเลขที่เลือกตรง (×ราคา)</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
                    {KIWI_TIER_HITS[editRule.bet_type].map(h => {
                      const c = parseCfg(editRule.match_config);
                      const tiers = c.payouts?.tiers || {};
                      const v = tiers[h] ?? KIWI_TIER_DEFAULTS[editRule.bet_type][h];
                      return (
                        <label key={h} className="bg-navy-900 border border-navy-700 rounded-lg px-2 py-1.5">
                          <span className="text-[10px] text-navy-400">ตรง {h} เลข →</span>
                          <input type="number" step="0.1" min="0" value={v}
                            onChange={e => setTier(editRule.bet_type, h, e.target.value)}
                            className="w-full bg-navy-800 border border-navy-600 rounded px-2 py-1 text-sm text-right" />
                        </label>
                      );
                    })}
                  </div>
                  <div className="text-[10px] text-navy-500 mt-1">เว้นว่าง/ลบค่า = ใช้ค่า default • 0 = ไม่จ่ายรางวัลระดับนั้น</div></div>
              ) : editRule.bet_type === 'kiwi_dice' ? (
                <div className="sm:col-span-2"><label className="text-navy-300 text-xs">อัตราจ่ายน้ำเต้าปูปลา — จ่ายกี่เท่าของราคา (×ราคา)</label>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    {['single', 'pair', 'triple'].map(k => {
                      const c = parseCfg(editRule.match_config);
                      const mults = c.payouts?.mults || {};
                      const v = mults[k] ?? DICE_MULT_DEFAULTS[k];
                      return (
                        <label key={k} className="bg-navy-900 border border-navy-700 rounded-lg px-2 py-1.5">
                          <span className="text-[10px] text-navy-400">{DICE_BET_LABEL[k]}</span>
                          <input type="number" step="0.1" min="0" value={v}
                            onChange={e => setDiceMult(k, e.target.value)}
                            className="w-full bg-navy-800 border border-navy-600 rounded px-2 py-1 text-sm text-right" />
                        </label>
                      );
                    })}
                  </div>
                  <div className="text-[10px] text-navy-500 mt-1">เว้นว่าง/ลบค่า = ใช้ค่า default • 0 = ไม่จ่ายรางวัลประเภทนั้น</div></div>
              ) : (
              <div><label className="text-navy-300 text-xs">อัตราจ่าย (จ่ายกี่เท่า)</label>
                <div className="flex items-center gap-2 mt-1">
                  <button type="button" onClick={() => setEditRule({...editRule, payout_multiplier: Math.max(0, +(Number(editRule.payout_multiplier) - 0.5).toFixed(2))})}
                    className="w-9 h-9 shrink-0 bg-navy-900 border border-navy-600 rounded-lg text-gold-300 font-bold hover:bg-navy-700">−</button>
                  <input type="number" step="0.5" min="0" value={editRule.payout_multiplier} onChange={e => setEditRule({...editRule, payout_multiplier: +e.target.value})}
                    className="flex-1 bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 min-w-0" />
                  <button type="button" onClick={() => setEditRule({...editRule, payout_multiplier: +(Number(editRule.payout_multiplier) + 0.5).toFixed(2)})}
                    className="w-9 h-9 shrink-0 bg-navy-900 border border-navy-600 rounded-lg text-gold-300 font-bold hover:bg-navy-700">+</button>
                </div>
                <div className="text-[10px] text-navy-500 mt-1">กด − / + เพื่อเพิ่มลดทีละ 0.5 หรือพิมพ์ตัวเลขเองได้เลย</div></div>
              )}
              <div><label className="text-navy-300 text-xs">ขั้นต่ำ (บาท)</label>
                <input type="number" step="0.01" min="0" value={toBaht(editRule.min_amount)} onChange={e => setEditRule({...editRule, min_amount: toSatang(e.target.value)})} className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1" /></div>
              <div><label className="text-navy-300 text-xs">สูงสุด (บาท, เว้นว่าง = ไม่จำกัด)</label>
                <input type="number" step="0.01" min="0" value={editRule.max_amount == null ? '' : toBaht(editRule.max_amount)} onChange={e => setEditRule({...editRule, max_amount: e.target.value === '' ? null : toSatang(e.target.value)})} className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1" /></div>
              <div className="sm:col-span-2 flex items-center gap-2">
                <input type="checkbox" checked={!!editRule.is_active} onChange={e => setEditRule({...editRule, is_active: e.target.checked ? 1 : 0})} className="accent-gold-500" />
                <label className="text-navy-200">เปิดใช้งาน</label>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Button onClick={saveRule} className="flex-1">บันทึก</Button>
              <Button variant="secondary" onClick={() => setEditRule(null)}>ยกเลิก</Button>
            </div>
        </>)}
      </Modal>
      </>)}
    </div>
  );
}
