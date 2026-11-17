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

  // ราคา/อัตราจ่ายเกมด่วนแก้ที่หน้าประเภทและกติกา (lottery_rules) ที่เดียว — key เหล่านี้เป็น cache ที่ sync อัตโนมัติ
  const GAME_KEYS = ['scratch_price', 'hilo_price', 'hilo_mult_low', 'hilo_mult_high', 'hilo_mult_11', 'kiwi_price_kiwi', 'kiwi_price_kiwi_vip', 'kiwi_price_kiwi_dice'];

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
  };
  useEffect(() => { load(); }, []);

  const toggleBetMenu = async () => {
    const next = !betMenuOn;
    if (!(await confirmAction({
      title: next ? 'เปิดเมนูแทงหวย' : '⚠️ ปิดเมนูแทงหวยทั้งหมด (Blind Mode)',
      message: next
        ? 'เปิดเมนูหวยให้สมาชิกเห็นอีกครั้ง ใช่หรือไม่?'
        : 'ปิดเมนูหวยทั้งหมดสำหรับสมาชิก — เมนูประเภทหวยและปุ่มหวยจะหายไปจากหน้าเว็บ (admin ยังเห็นปกติ) ใช่หรือไม่?',
    }))) return;
    try {
      await api('/admin/settings/betting_menu_enabled', { method: 'PUT', body: { value: next } });
      setBetMenuOn(next);
      toast(next ? 'เปิดเมนูแทงหวยแล้ว' : 'ปิดเมนูแทงหวยทั้งหมดแล้ว — สมาชิกจะไม่เห็นเมนูหวย', 'success');
    } catch (e) { toast(e.message, 'error'); }
  };

  const toggleTypeMenu = async (code, show) => {
    const next = show ? hiddenTypes.filter(c => c !== code) : [...hiddenTypes, code];
    try {
      await api('/admin/settings/bet_menu_hidden_types', { method: 'PUT', body: { value: next } });
      setHiddenTypes(next);
      toast(show ? `แสดงเมนูหวย ${code} แล้ว` : `ซ่อนเมนูหวย ${code} แล้ว — สมาชิกจะไม่เห็นประเภทนี้`, 'success');
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
      <h1 className="text-2xl font-bold text-white">ตั้งค่าระบบ (System Configuration)</h1>
      {msg && <div className="text-sm text-gold-300 bg-navy-800 border border-navy-700 rounded-lg p-3">{msg}</div>}

      {/* Blind mode — ซ่อนเมนูแทงหวยจากสมาชิก */}
      <Card variant={betMenuOn ? 'default' : 'danger'}>
      <CardBody className="flex items-center gap-4">
        <div className="flex-1">
          <div className="font-bold text-white">🎰 แสดงเมนูแทงหวย (Blind Mode)</div>
          <div className="text-xs text-navy-300 mt-0.5">
            {betMenuOn
              ? '🟢 เปิดอยู่ — สมาชิกเห็นเมนูหวยตามปกติ'
              : '🔴 ซ่อนอยู่ — ซ่อนเฉพาะเมนู/ปุ่ม (สมาชิกยังแทงผ่านลิงก์ตรงได้ • รอบหวยยังสร้างปกติ)'}
          </div>
          <div className="text-[11px] text-navy-500 mt-1">⚠️ อันนี้แค่ซ่อนเมนู — ถ้าต้องการปิดตลาดจริง (หยุดสร้างรอบ/หยุดรับแทง) ไปที่ <b>ประเภทหวย &amp; กติกา → ปิดประเภท</b></div>
        </div>
        <Button variant={betMenuOn ? 'danger' : 'accent'} onClick={toggleBetMenu}>
          {betMenuOn ? 'ปิดทั้งหมด' : 'เปิดทั้งหมด'}
        </Button>
      </CardBody>
      </Card>

      {/* เลือกซ่อนรายประเภท — มีผลเมื่อเปิดเมนูรวมอยู่ */}
      {betMenuOn && lotteryTypes.length > 0 && (
        <Card>
        <CardBody>
          <div className="text-sm font-bold text-white mb-1">🎯 ซ่อนเมนูเฉพาะประเภท (แสดงผลอย่างเดียว)</div>
          <div className="text-xs text-navy-400 mb-1">ติ๊ก "แสดง" = สมาชิกเห็นเมนูประเภทนั้น • ติ๊กออก = ซ่อนการ์ดเมนูเฉยๆ — <b className="text-amber-300">ระบบยังสร้างรอบและรับแทงได้ปกติ</b> (ต่างจากปิดตลาดจริงที่หน้าประเภทหวย &amp; กติกา)</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {lotteryTypes.map(t => {
              const shown = !hiddenTypes.includes(t.code);
              return (
                <label key={t.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition ${shown ? 'border-navy-600 bg-navy-900/60' : 'border-red-500/40 bg-red-500/10'}`}>
                  <input type="checkbox" checked={shown} onChange={e => toggleTypeMenu(t.code, e.target.checked)}
                    className="w-5 h-5 accent-gold-500" />
                  <span className="flex-1 text-sm font-semibold text-white">{t.name_th}</span>
                  <code className="text-[10px] text-navy-400">{t.code}</code>
                  {!shown && <span className="text-[10px] font-bold text-red-400">ซ่อนอยู่</span>}
                </label>
              );
            })}
          </div>
        </CardBody>
        </Card>
      )}

      {/* Cashback promotion — คืนยอดเสียให้สมาชิก */}
      <Card>
        <CardBody>
        <div className="text-sm font-bold text-white mb-1">🎁 Cashback — คืนยอดเสีย</div>
        <div className="text-xs text-navy-400 mb-3">
          คืนเครดิต % ของยอดเสียสุทธิ (เดิมพัน − รางวัล) ย้อนหลัง 24 ชม. • รันอัตโนมัติวันละครั้ง หรือกดจ่ายเองได้ • เครดิตเสมือนเพื่อการศึกษา
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <label className="block">
            <span className="text-[11px] text-navy-300">คืนยอดเสีย (%)</span>
            <input value={cashbackPct} onChange={e => setCashbackPct(e.target.value)}
              className="w-28 mt-1 bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 text-sm" placeholder="0" />
          </label>
          <Button onClick={saveCashback} size="sm">บันทึก %</Button>
          <Button variant="ghost" size="sm" onClick={() => cashbackAction('preview')}>ดูยอดที่จะจ่าย</Button>
          <Button variant="accent" size="sm" onClick={() => cashbackAction('run')}>จ่ายเลย</Button>
        </div>
        {cashbackPreview && (
          <div className="mt-3 text-xs text-navy-200 bg-navy-900/70 border border-navy-600 rounded-lg px-3 py-2">
            ย้อนหลัง 24 ชม.: {cashbackPreview.percent}% → จะคืนให้ <b className="text-gold-300">{cashbackPreview.users}</b> คน รวม <b className="text-gold-300">{(cashbackPreview.total / 100).toLocaleString('th-TH')} บาท</b>
          </div>
        )}
        {cashbackMsg && <div className={`text-xs mt-3 ${cashbackMsg.startsWith('ERROR') ? 'text-red-400' : 'text-green-400'}`}>{cashbackMsg}</div>}
        </CardBody>
      </Card>

      <Card className="divide-y divide-navy-700">
        {settings.filter(s => s.key !== 'betting_menu_enabled' && s.key !== 'bet_menu_hidden_types' && !GAME_KEYS.includes(s.key) && !['cashback_percent', 'cashback_last_run'].includes(s.key)).map(s => (
          <div key={s.key} className="p-4 flex items-center gap-4">
            <div className="w-56 shrink-0">
              <code className="text-gold-300 text-sm">{s.key}</code>
              <div className="text-[10px] text-navy-400">updated {s.updatedAt}</div>
            </div>
            <input value={edits[s.key] ?? ''} onChange={e => setEdits({...edits, [s.key]: e.target.value})}
              className="flex-1 bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 text-sm font-mono" />
            <Button variant="ghost" size="sm" onClick={() => save(s.key)}>บันทึก</Button>
          </div>
        ))}
        {!settings.length && <div className="p-6 text-center text-navy-400">ไม่มีการตั้งค่า</div>}
      </Card>
      <div className="text-xs text-navy-400">หมายเหตุ: การตั้งค่าเช่น initial_credit มีผลกับสมาชิกใหม่เท่านั้น</div>
    </div>
  );
}
