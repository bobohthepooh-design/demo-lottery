import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { confirmAction } from './confirm.jsx';
import { resultSchema } from '../lotterySchema.js';
import { TypeBadge } from '../components/ResultLine.jsx';
import AdminSettle from './Settle.jsx';

// แปลง match_config เป็นภาษาคนอ่านง่าย
const SOURCE_TH = {
  first: 'รางวัลที่ 1', front3: 'เลขหน้า 3 ตัว', top3: 'เลขท้าย 3 ตัวบน',
  bottom2: 'เลขท้าย 2 ตัว', last4: 'เลขท้าย 4 ตัว', last3: 'เลขท้าย 3 ตัว',
  last2: 'เลขท้าย 2 ตัว', num4: 'เลข 4 ตัว', top2: 'เลข 2 ตัวบน', main: 'เลขหลัก',
};
const MODE_TH = {
  exact: 'ตรงกันเป๊ะ', sorted: 'โต๊ด (สลับหลักได้)', digit_contains: 'วิ่ง (มีเลขนั้น)',
  tail: 'เทียบท้าย', head: 'เทียบหน้า',
};
function matchLabel(cfg) {
  try {
    const c = JSON.parse(cfg);
    return `${SOURCE_TH[c.source] || c.source} • ${MODE_TH[c.mode] || c.mode}`;
  } catch { return cfg; }
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
  const [editRule, setEditRule] = useState(null);
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [typeForm, setTypeForm] = useState({ code: '', name_th: '', name_en: '', description: '' });
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'settle' ? 'settle' : 'rules';
  const setTab = (t) => setParams(t === 'settle' ? { tab: 'settle' } : {});

  const load = () => {
    api('/admin/lottery/types').then(r => setTypes(r.types)).catch(e => alert(e.message));
    api('/admin/lottery/rules').then(r => setRules(r.rules)).catch(() => {});
    api('/admin/lottery/categories').then(r => setCategories(r.categories)).catch(() => {});
  };
  useEffect(load, []);

  const createType = async (e) => {
    e.preventDefault();
    if (!(await confirmAction({ title: 'ยืนยันเพิ่มประเภทหวย', message: `เพิ่มประเภทหวย "${typeForm.name_th}" (${typeForm.code}) ใช่หรือไม่?` }))) return;
    try { await api('/admin/lottery/types', { method: 'POST', body: typeForm }); setShowTypeForm(false); setTypeForm({ code:'', name_th:'', name_en:'', description:'' }); load(); }
    catch (e2) { alert(e2.message); }
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

  const saveRule = async () => {
    if (!(await confirmAction({ title: editRule.id ? 'ยืนยันแก้ไขกติกา' : 'ยืนยันเพิ่มกติกา', message: `${editRule.id ? 'บันทึกการแก้ไข' : 'เพิ่ม'}กติกา "${editRule.name_th}" ใช่หรือไม่?` }))) return;
    try {
      const body = { ...editRule, category_id: editRule.category_id || null };
      if (editRule.id) await api(`/admin/lottery/rules/${editRule.id}`, { method: 'PATCH', body });
      else await api('/admin/lottery/rules', { method: 'POST', body });
      setEditRule(null); load();
    } catch (e) { alert(e.message); }
  };

  const typeName = (id) => types.find(t => t.id === id)?.name_th || `#${id}`;
  const catName = (id) => categories.find(c => c.id === id)?.name_th || '';
  const visibleRules = showInactive ? rules : rules.filter(r => r.is_active);

  // จัดกลุ่ม: ประเภทหวย → หมวด → กติกา
  const sections = types.map(t => {
    const typeRules = visibleRules.filter(r => r.lottery_type_id === t.id);
    if (!typeRules.length) return null;
    const catIds = [...new Set(typeRules.map(r => r.category_id || 0))];
    const groups = catIds.map(cid => ({
      cid: cid || null,
      name: cid ? catName(cid) : 'ทั่วไป (ไม่ระบุหมวด)',
      rows: typeRules.filter(r => (r.category_id || 0) === cid),
    }));
    return { type: t, groups };
  }).filter(Boolean);

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
    <div className="space-y-6">
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
        <button onClick={() => setShowTypeForm(!showTypeForm)} className="bg-gold-500 text-navy-950 font-bold px-4 py-2 rounded-lg text-sm">+ เพิ่มประเภทหวย</button>
      </div>

      {showTypeForm && (
        <form onSubmit={createType} className="bg-navy-800 border border-navy-700 rounded-xl p-5 grid sm:grid-cols-2 gap-3">
          <input required placeholder="code (เช่น TH)" value={typeForm.code} onChange={e => setTypeForm({...typeForm, code: e.target.value})} className="bg-navy-900 border border-navy-600 rounded-lg px-3 py-2" />
          <input required placeholder="ชื่อภาษาไทย" value={typeForm.name_th} onChange={e => setTypeForm({...typeForm, name_th: e.target.value})} className="bg-navy-900 border border-navy-600 rounded-lg px-3 py-2" />
          <input placeholder="ชื่อภาษาอังกฤษ" value={typeForm.name_en} onChange={e => setTypeForm({...typeForm, name_en: e.target.value})} className="bg-navy-900 border border-navy-600 rounded-lg px-3 py-2" />
          <input placeholder="คำอธิบาย" value={typeForm.description} onChange={e => setTypeForm({...typeForm, description: e.target.value})} className="bg-navy-900 border border-navy-600 rounded-lg px-3 py-2" />
          <button className="bg-gold-500 text-navy-950 font-bold py-2 rounded-lg sm:col-span-2">บันทึก</button>
        </form>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        {types.map(t => (
          <div key={t.id} className="bg-navy-800 border border-navy-700 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="font-bold text-white">{t.name_th} <span className="text-xs text-navy-400">({t.code})</span></div>
              <button onClick={() => toggleType(t)} className={`text-xs px-2 py-1 rounded ${t.is_active ? 'bg-green-500/20 text-green-300' : 'bg-navy-700 text-navy-400'}`}>
                {t.is_active ? 'เปิด' : 'ปิด'}
              </button>
            </div>
            <div className="text-xs text-navy-300 mt-1">{t.description}</div>
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
            <div className="text-xs text-navy-400 mt-2">{rules.filter(r => r.lottery_type_id === t.id && r.is_active).length} ประเภทการแทงที่ใช้งาน</div>
          </div>
        ))}
      </div>

      {/* กติกา แยกตามประเทศ/หมวดหวย */}
      <div className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold text-white text-lg">กติกาการแทงรายประเทศ/หมวด</h2>
          <div className="flex items-center gap-3">
            <label className="text-xs text-navy-300 flex items-center gap-1.5">
              <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="accent-gold-500" />
              แสดงที่ปิดใช้งาน ({rules.filter(r => !r.is_active).length})
            </label>
            <button onClick={() => setEditRule(emptyRule(types[0]?.id))} className="text-sm text-gold-400 hover:underline">+ เพิ่มกติกา</button>
          </div>
        </div>

        {sections.map(({ type, groups }) => (
          <div key={type.id} className="bg-navy-800 border border-navy-700 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 bg-navy-900/60 border-b border-navy-700 flex items-center gap-2">
              <TypeBadge code={type.code} className="w-7 h-7 text-[10px]" />
              <span className="font-bold text-white">{type.name_th}</span>
              <span className="text-xs text-navy-400">({type.code})</span>
            </div>
            {groups.map(g => (
              <div key={g.cid || 'none'} className={g.cid ? 'border-t border-navy-700/60' : ''}>
                <div className="px-5 py-2 bg-navy-800/60 text-xs font-semibold text-gold-400/90">
                  {g.name}
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
                        <td className="px-3 py-2.5 text-center text-navy-200">{r.digits} หลัก</td>
                        <td className="px-3 py-2.5 text-navy-300 text-xs" title={r.match_config}>{matchLabel(r.match_config)}</td>
                        <td className="px-3 py-2.5 text-right text-gold-300 font-semibold">x{r.payout_multiplier}</td>
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
                        <td className="px-3 py-2.5 text-right">
                          <button onClick={() => setEditRule({ ...r })} className="text-gold-400 text-xs hover:underline">แก้ไข</button>
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

      {editRule && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setEditRule(null)}>
          <div className="bg-navy-800 border border-navy-600 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-4">{editRule.id ? 'แก้ไข' : 'เพิ่ม'}กติกา</h2>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div><label className="text-navy-300 text-xs">ประเภทหวย</label>
                <select value={editRule.lottery_type_id} disabled={!!editRule.id} onChange={e => setEditRule({...editRule, lottery_type_id: +e.target.value, category_id: null})}
                  className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1">
                  {types.map(t => <option key={t.id} value={t.id}>{t.name_th} ({t.code})</option>)}
                </select></div>
              <div><label className="text-navy-300 text-xs">หมวดหวย (เว้นว่าง = ทั่วไป)</label>
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
                  <div><label className="text-navy-300 text-xs">จำนวนหลัก</label>
                    <input type="number" min="1" max="10" value={editRule.digits} onChange={e => setEditRule({...editRule, digits: +e.target.value})} className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1" /></div>
                  <div className="sm:col-span-2"><label className="text-navy-300 text-xs">{`match_config (JSON: {"source":"...","mode":"exact|sorted|digit_contains|tail|head"})`}</label>
                    <input value={editRule.match_config} onChange={e => setEditRule({...editRule, match_config: e.target.value})} className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1 font-mono" /></div>
                  <div><label className="text-navy-300 text-xs">หน่วยเดิมพัน (บาท)</label>
                    <input type="number" step="0.01" value={toBaht(editRule.stake_unit)} onChange={e => setEditRule({...editRule, stake_unit: toSatang(e.target.value)})} className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1" /></div>
                </>
              )}
              <div><label className="text-navy-300 text-xs">ชื่อไทย (แสดงให้สมาชิก)</label>
                <input value={editRule.name_th} onChange={e => setEditRule({...editRule, name_th: e.target.value})} className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1" /></div>
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
              <button onClick={saveRule} className="flex-1 bg-gold-500 text-navy-950 font-bold py-2.5 rounded-lg">บันทึก</button>
              <button onClick={() => setEditRule(null)} className="px-5 py-2.5 border border-navy-600 rounded-lg">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}
