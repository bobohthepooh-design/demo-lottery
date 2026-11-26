import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { confirmAction } from './confirm.jsx';
import { toast } from '../components/toast.js';
import { Card, CardBody, Button } from '../components/ui/index.js';

export default function AdminSettings() {
  const [settings, setSettings] = useState([]);
  const [edits, setEdits] = useState({});
  const [msg, setMsg] = useState('');
  const [betMenuOn, setBetMenuOn] = useState(true);
  const [lotteryTypes, setLotteryTypes] = useState([]);
  const [hiddenTypes, setHiddenTypes] = useState([]);
  const [cashbackPct, setCashbackPct] = useState('0');
  const [cashbackMsg, setCashbackMsg] = useState('');
  const [cashbackPreview, setCashbackPreview] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [campForm, setCampForm] = useState({ name: '', percent: '', window_hours: '24', min_satang: '100' });

  // ราคา/อัตราจ่ายเกมด่วนแก้ที่หน้าประเภทและกติกา (lottery_rules) ที่เดียว — key เหล่านี้เป็น cache ที่ sync อัตโนมัติ
  const GAME_KEYS = ['scratch_price', 'hilo_price', 'hilo_mult_low', 'hilo_mult_high', 'hilo_mult_11', 'kiwi_price_kiwi', 'kiwi_price_kiwi_vip', 'kiwi_price_kiwi_dice'];
  // sync กับ SUPER_ONLY_SETTINGS ใน server/src/routes/admin.js — super_admin เท่านั้นที่แก้ได้
  const SUPER_ONLY_KEYS = ['maker_checker', 'initial_credit', 'require_email_verify_for_withdraw', 'admin_allowed_ips'];

  const load = () => {
    api('/admin/settings').then(r => {
      setSettings(r.settings);
      const m = {};
      r.settings.forEach(s => { m[s.key] = typeof s.value === 'object' ? JSON.stringify(s.value) : String(s.value); });
      setEdits(m);
      const bm = r.settings.find(s => s.key === 'betting_menu_enabled');
      setBetMenuOn(bm ? bm.value !== false : true);
      const ht = r.settings.find(s => s.key === 'bet_menu_hidden_types');
      setHiddenTypes(Array.isArray(ht?.value) ? ht.value : []);
      const cb = r.settings.find(s => s.key === 'cashback_percent');
      if (cb) setCashbackPct(String(cb.value ?? 0));
    }).catch(e => toast(e.message, 'error'));
    api('/admin/lottery/types').then(r => setLotteryTypes(r.types || [])).catch(() => {});
    api('/admin/promotions/campaigns').then(r => setCampaigns(r.campaigns || [])).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const toggleBetMenu = async () => {
    const next = !betMenuOn;
    if (!(await confirmAction({
      title: next ? 'เปิดเมนูแทงหวย' : '⚠️ ปิดเมนูแทงหวยทั้งหมด (Blind Mode)',
      message: next
        ? 'เปิดเมนูหวยให้สมาชิกเห็นอีกครั้ง ใช่หรือไม่?'
        : 'ปิดรับเดิมพันทั้งหมดสำหรับสมาชิก — ซ่อนเมนูทุกอัน + block การแทงจริงฝั่ง server (admin ยังเห็นปกติ) ใช่หรือไม่?',
    }))) return;
    try {
      await api('/admin/settings/betting_menu_enabled', { method: 'PUT', body: { value: next } });
      setBetMenuOn(next);
      toast(next ? 'เปิดรับเดิมพันแล้ว' : 'ปิดรับเดิมพันทั้งหมดแล้ว — สมาชิกแทงไม่ได้ทุกประเภท', 'success');
    } catch (e) { toast(e.message, 'error'); }
  };

  const toggleTypeMenu = async (code, show) => {
    const next = show ? hiddenTypes.filter(c => c !== code) : [...hiddenTypes, code];
    try {
      await api('/admin/settings/bet_menu_hidden_types', { method: 'PUT', body: { value: next } });
      setHiddenTypes(next);
      toast(show ? `เปิดรับหวย ${code} แล้ว` : `ปิดหวย ${code} แล้ว — ซ่อนเมนู + บล็อกการแทงประเภทนี้`, 'success');
    } catch (e) { toast(e.message, 'error'); }
  };

  const saveCashback = async () => {
    const v = parseFloat(cashbackPct);
    if (!Number.isFinite(v) || v < 0 || v > 100) { setCashbackMsg('ERROR: กรอก 0-100'); return; }
    if (!(await confirmAction({
      title: 'ยืนยันตั้งค่า Cashback',
      message: `ตั้งคืนยอดเสีย ${v}% ต่อวัน? (ย้อนหลัง 24 ชม. — รันอัตโนมัติวันละครั้ง + ปุ่มจ่ายเองได้)`,
    }))) return;
    try {
      await api('/admin/settings/cashback_percent', { method: 'PUT', body: { value: v } });
      setCashbackPct(String(v));
      setCashbackMsg(`บันทึกแล้ว — คืนยอดเสีย ${v}%/วัน`);
      load();
    } catch (e) { setCashbackMsg('ERROR: ' + e.message); }
  };

  const cashbackAction = async (kind) => {
    setCashbackMsg(''); setCashbackPreview(null);
    try {
      if (kind === 'preview') {
        const r = await api('/admin/promotions/cashback/preview?hours=24');
        setCashbackPreview(r.preview);
      } else {
        if (!(await confirmAction({
          title: 'ยืนยันจ่าย Cashback เลย',
          message: 'คำนวณยอดเสียย้อนหลัง 24 ชม. และคืนเครดิต members ทั้งหมดทันที? (idempotent — กดซ้ำไม่จ่ายซ้ำ)',
        }))) return;
        const r = await api('/admin/promotions/cashback/run', { method: 'POST', body: { hours: 24 } });
        setCashbackMsg(r.skipped === 'disabled'
          ? 'ERROR: ยังไม่ได้ตั้ง cashback_percent (>0)'
          : `จ่ายแล้ว — ${r.users} คน รวม ${(r.total / 100).toLocaleString('th-TH')} บาท`);
      }
    } catch (e) { setCashbackMsg('ERROR: ' + e.message); }
  };

  const createCampaign = async () => {
    const percent = parseInt(campForm.percent, 10);
    const window_hours = parseInt(campForm.window_hours, 10) || 24;
    const min_satang = Math.round(parseFloat(campForm.min_satang) * 100) || 0;
    if (!campForm.name.trim() || !Number.isFinite(percent) || percent < 1 || percent > 100) {
      toast('กรอกชื่อแคมเปญและ % (1-100) ให้ครบ', 'error'); return;
    }
    try {
      await api('/admin/promotions/campaigns', { method: 'POST', body: { name: campForm.name.trim(), percent, window_hours, min_satang } });
      setCampForm({ name: '', percent: '', window_hours: '24', min_satang: '100' });
      toast('สร้างแคมเปญแล้ว', 'success'); load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const toggleCampaign = async (c) => {
    try {
      await api(`/admin/promotions/campaigns/${c.id}`, { method: 'PATCH', body: { active: !c.active } });
      toast(c.active ? 'ปิดแคมเปญแล้ว' : 'เปิดแคมเปญแล้ว (แคมเปญอื่นจะถูกปิดอัตโนมัติ)', 'success'); load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const runCampaign = async (c) => {
    if (!(await confirmAction({
      title: `ยืนยันรันแคมเปญ "${c.name}"`,
      message: `คืนยอดเสีย ${c.percent}% ย้อนหลัง ${c.window_hours} ชม. (ขั้นต่ำ ${(c.min_satang / 100).toLocaleString('th-TH')} บาท) ให้สมาชิกทั้งหมดทันที?`,
    }))) return;
    try {
      const r = await api(`/admin/promotions/campaigns/${c.id}/run`, { method: 'POST' });
      toast(r.skipped === 'disabled' ? 'แคมเปญถูกปิด/ไม่มีผล' : `จ่ายแล้ว — ${r.users} คน รวม ${(r.total / 100).toLocaleString('th-TH')} บาท`, r.users ? 'success' : 'error');
    } catch (e) { toast(e.message, 'error'); }
  };

  const save = async (key) => {
    if (!(await confirmAction({ title: 'ยืนยันบันทึกการตั้งค่า', message: `บันทึกการเปลี่ยนแปลง "${key}" ใช่หรือไม่?` }))) return;
    let value = edits[key];
    try { value = JSON.parse(value); } catch {}
    try {
      await api(`/admin/settings/${key}`, { method: 'PUT', body: { value } });
      setMsg(`บันทึก ${key} แล้ว`); load();
    } catch (e) { setMsg('ERROR: ' + e.message); }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold [color:var(--white)]">ตั้งค่าระบบ (System Configuration)</h1>
      {msg && <div className="text-sm p-3 rounded-lg [color:var(--gold-primary)] [background:var(--bg-dark-surface)] [border:1px_solid_var(--border-light)]">{msg}</div>}

      {/* Blind mode — ซ่อนเมนูแทงหวยจากสมาชิก */}
      <Card style={{ background: 'var(--bg-card)', border: `1px solid ${betMenuOn ? 'var(--border-light)' : 'var(--danger-red)'}`, borderRadius: 'var(--radius-xl)' }}>
      <CardBody className="flex items-center gap-4">
        <div className="flex-1">
          <div className="font-bold [color:var(--white)]">🎰 แสดงเมนูแทงหวย (Blind Mode)</div>
          <div className="text-xs mt-0.5 [color:var(--light-gray)]">
            {betMenuOn
              ? '🟢 เปิดอยู่ — สมาชิกเห็นเมนูหวยและแทงได้ตามปกติ'
              : '🔴 ปิดอยู่ — ซ่อนเมนูทั้งหมด + บล็อกการแทงจริงทุกประเภท (หวย+เกมด่วน) โดย admin ยังดูได้ปกติ'}
          </div>
          <div className="text-[11px] mt-1 [color:var(--dark-gray)]">⚠️ ตอนปิด ระบบจะ block ทุกโพยใหม่ (server-side) — ผล/ประวัติ/กระเป๋ายังใช้งานได้ปกติ</div>
        </div>
        <Button onClick={toggleBetMenu} style={{ background: betMenuOn ? 'var(--danger-red)' : 'linear-gradient(135deg, var(--gold-gradient-start), var(--gold-gradient-end))', color: betMenuOn ? 'var(--white)' : 'var(--bg-deep-black)' }}>
          {betMenuOn ? 'ปิดทั้งหมด' : 'เปิดทั้งหมด'}
        </Button>
      </CardBody>
      </Card>

      {/* เลือกซ่อนรายประเภท — มีผลเมื่อเปิดเมนูรวมอยู่ */}
      {betMenuOn && lotteryTypes.length > 0 && (
        <Card className="[background:var(--bg-card)] [border:1px_solid_var(--border-light)] [border-radius:var(--radius-xl)]">
        <CardBody>
          <div className="text-sm font-bold mb-1 [color:var(--white)]">🎯 เปิด/ปิดเฉพาะประเภท</div>
          <div className="text-xs mb-1 [color:var(--muted-gray)]">ติ๊ก "แสดง" = สมาชิกเห็นเมนูและแทงประเภทนั้นได้ • ติ๊กออก = <b className="[color:var(--danger-red)]">ซ่อนเมนู + บล็อกการแทงประเภทนั้นจริง</b> (รวมเกมด่วน SC/HL/KI และรอบหวยปกติ)</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {lotteryTypes.map(t => {
              const shown = !hiddenTypes.includes(t.code);
              return (
                <label key={t.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition ${shown ? '' : 'border-[rgba(239,68,68,0.4)] bg-[rgba(239,68,68,0.1)]'}`} style={shown ? { borderColor: 'var(--border-light)', background: 'var(--bg-dark-surface)' } : {}}>
                  <input type="checkbox" checked={shown} onChange={e => toggleTypeMenu(t.code, e.target.checked)}
                    className="w-5 h-5 [accent-color:var(--gold-primary)]" />
                  <span className="flex-1 text-sm font-semibold [color:var(--white)]">{t.name_th}</span>
                  <code className="text-[10px] [color:var(--muted-gray)]">{t.code}</code>
                  {!shown && <span className="text-[10px] font-bold [color:var(--danger-red)]">ซ่อนอยู่</span>}
                </label>
              );
            })}
          </div>
        </CardBody>
        </Card>
      )}

      {/* Cashback promotion — คืนยอดเสียให้สมาชิก */}
      <Card className="[background:var(--bg-card)] [border:1px_solid_var(--border-light)] [border-radius:var(--radius-xl)]">
        <CardBody>
        <div className="text-sm font-bold mb-1 [color:var(--white)]">🎁 Cashback — คืนยอดเสีย</div>
        <div className="text-xs mb-3 [color:var(--muted-gray)]">
          คืนเครดิต % ของยอดเสียสุทธิ (เดิมพัน − รางวัล) ย้อนหลัง 24 ชม. • รันอัตโนมัติวันละครั้ง หรือกดจ่ายเองได้ • เครดิตเสมือนเพื่อการศึกษา
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <label className="block">
            <span className="text-[11px] [color:var(--light-gray)]">คืนยอดเสีย (%)</span>
            <input value={cashbackPct} onChange={e => setCashbackPct(e.target.value)}
              className="w-28 mt-1 rounded-lg px-3 py-2 text-sm [background:var(--bg-dark-surface)] [border:1px_solid_var(--border-light)] [color:var(--white)]" placeholder="0" />
          </label>
          <Button onClick={saveCashback} size="sm" className="[background:linear-gradient(135deg,_var(--gold-gradient-start),_var(--gold-gradient-end))] [color:var(--bg-deep-black)]">บันทึก %</Button>
          <Button variant="ghost" size="sm" onClick={() => cashbackAction('preview')} className="[color:var(--gold-primary)] [border:1px_solid_var(--border-light)]">ดูยอดที่จะจ่าย</Button>
          <Button size="sm" onClick={() => cashbackAction('run')} className="[background:linear-gradient(135deg,_var(--gold-gradient-start),_var(--gold-gradient-end))] [color:var(--bg-deep-black)]">จ่ายเลย</Button>
        </div>
        {cashbackPreview && (
          <div className="mt-3 text-xs rounded-lg px-3 py-2 [color:var(--light-gray)] [background:var(--bg-dark-surface)] [border:1px_solid_var(--border-light)]">
            ย้อนหลัง 24 ชม.: {cashbackPreview.percent}% → จะคืนให้ <b className="[color:var(--gold-primary)]">{cashbackPreview.users}</b> คน รวม <b className="[color:var(--gold-primary)]">{(cashbackPreview.total / 100).toLocaleString('th-TH')} บาท</b>
          </div>
        )}
        {cashbackMsg && <div className={`text-xs mt-3`} style={{ color: cashbackMsg.startsWith('ERROR') ? 'var(--danger-red)' : 'var(--success-green)' }}>{cashbackMsg}</div>}
        </CardBody>
      </Card>

      {/* Promotion campaigns — cashback แบบมีชื่อ/เงื่อนไข ของตัวเอง */}
      <Card className="[background:var(--bg-card)] [border:1px_solid_var(--border-light)] [border-radius:var(--radius-xl)]">
        <CardBody>
        <div className="text-sm font-bold mb-1 [color:var(--white)]">📣 แคมเปญโปรโมชัน (Cashback)</div>
        <div className="text-xs mb-3 [color:var(--muted-gray)]">
          แคมเปญที่ active จะถูกใช้แทน % ในการตั้งค่าด้านบนตอนรันรายวัน • เปิดได้ครั้งละ 1 แคมเปญ • รันเองได้ทุกเมื่อ (idempotent)
        </div>
        <div className="flex items-end gap-2 flex-wrap mb-3">
          <input value={campForm.name} onChange={e => setCampForm({ ...campForm, name: e.target.value })}
            placeholder="ชื่อแคมเปญ" className="rounded-lg px-3 py-2 text-sm w-44 [background:var(--bg-dark-surface)] [border:1px_solid_var(--border-light)] [color:var(--white)]" />
          <label className="text-[11px] [color:var(--light-gray)]">คืน (%)
            <input value={campForm.percent} onChange={e => setCampForm({ ...campForm, percent: e.target.value })}
              className="block mt-1 rounded-lg px-3 py-2 text-sm w-20 [background:var(--bg-dark-surface)] [border:1px_solid_var(--border-light)] [color:var(--white)]" placeholder="5" />
          </label>
          <label className="text-[11px] [color:var(--light-gray)]">ย้อนหลัง (ชม.)
            <input value={campForm.window_hours} onChange={e => setCampForm({ ...campForm, window_hours: e.target.value })}
              className="block mt-1 rounded-lg px-3 py-2 text-sm w-20 [background:var(--bg-dark-surface)] [border:1px_solid_var(--border-light)] [color:var(--white)]" />
          </label>
          <label className="text-[11px] [color:var(--light-gray)]">ขั้นต่ำ (บาท)
            <input value={campForm.min_satang} onChange={e => setCampForm({ ...campForm, min_satang: e.target.value })}
              className="block mt-1 rounded-lg px-3 py-2 text-sm w-24 [background:var(--bg-dark-surface)] [border:1px_solid_var(--border-light)] [color:var(--white)]" />
          </label>
          <Button size="sm" onClick={createCampaign} className="[background:linear-gradient(135deg,_var(--gold-gradient-start),_var(--gold-gradient-end))] [color:var(--bg-deep-black)]">+ สร้างแคมเปญ</Button>
        </div>
        <div className="space-y-2">
          {campaigns.map(c => (
            <div key={c.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5`} style={c.active ? { borderColor: 'var(--border-gold)', background: 'rgba(212, 175, 55, 0.05)' } : { borderColor: 'var(--border-light)', background: 'var(--bg-dark-surface)' }}>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate [color:var(--white)]">{c.name}
                  {c.active ? <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded [background:rgba(212,_175,_55,_0.2)] [color:var(--gold-primary)] [border:1px_solid_var(--border-gold)]">ACTIVE</span> : null}
                </div>
                <div className="text-[11px] [color:var(--muted-gray)]">คืน {c.percent}% • ย้อนหลัง {c.window_hours} ชม. • ขั้นต่ำ {(c.min_satang / 100).toLocaleString('th-TH')} บาท{c.created_by_name ? ` • โดย ${c.created_by_name}` : ''}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => runCampaign(c)} className="[color:var(--gold-primary)] [border:1px_solid_var(--border-light)]">รันเลย</Button>
              <Button size="sm" onClick={() => toggleCampaign(c)} style={{ background: c.active ? 'var(--danger-red)' : 'linear-gradient(135deg, var(--gold-gradient-start), var(--gold-gradient-end))', color: c.active ? 'var(--white)' : 'var(--bg-deep-black)' }}>{c.active ? 'ปิด' : 'เปิด'}</Button>
            </div>
          ))}
          {!campaigns.length && <div className="text-xs py-2 [color:var(--dark-gray)]">ยังไม่มีแคมเปญ — สร้างด้านบน</div>}
        </div>
        </CardBody>
      </Card>

      <Card className="divide-y [background:var(--bg-card)] [border:1px_solid_var(--border-light)] [border-radius:var(--radius-xl)] [border-color:var(--border-light)]">
        {settings.filter(s => s.key !== 'betting_menu_enabled' && s.key !== 'bet_menu_hidden_types' && !GAME_KEYS.includes(s.key) && !['cashback_percent', 'cashback_last_run'].includes(s.key)).map(s => (
          <div key={s.key} className="p-4 flex items-center gap-4 [border-color:var(--border-light)]">
            <div className="w-56 shrink-0">
              <code className="text-sm [color:var(--gold-primary)]">{s.key}</code>
              {SUPER_ONLY_KEYS.includes(s.key) && <span className="ml-1 text-[9px] font-bold px-1 py-0.5 rounded [background:rgba(239,_68,_68,_0.15)] [color:var(--danger-red)] [border:1px_solid_rgba(239,_68,_68,_0.4)]">SUPER</span>}
              <div className="text-[10px] [color:var(--muted-gray)]">updated {s.updatedAt}</div>
            </div>
            <input value={edits[s.key] ?? ''} onChange={e => setEdits({...edits, [s.key]: e.target.value})}
              className="flex-1 rounded-lg px-3 py-2 text-sm font-mono [background:var(--bg-dark-surface)] [border:1px_solid_var(--border-light)] [color:var(--white)]" />
            <Button variant="ghost" size="sm" onClick={() => save(s.key)} className="[color:var(--gold-primary)] [border:1px_solid_var(--border-light)]">บันทึก</Button>
          </div>
        ))}
        {!settings.length && <div className="p-6 text-center [color:var(--muted-gray)]">ไม่มีการตั้งค่า</div>}
      </Card>
      <div className="text-xs [color:var(--muted-gray)]">หมายเหตุ: การตั้งค่าเช่น initial_credit มีผลกับสมาชิกใหม่เท่านั้น</div>
    </div>
  );
}
