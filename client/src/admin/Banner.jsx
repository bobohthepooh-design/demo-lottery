import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { AdminLoading, AdminError } from '../components/AdminStates.jsx';
import { toast } from '../components/toast.js';
import { DEFAULT_BANNER } from '../bannerConfig.js';
import { confirmAction } from './confirm.jsx';
import { Card, CardBody, Button } from '../components/ui/index.js';

const FIELDS = [
  { key: 'enabled', label: 'แสดงแบนเนอร์', type: 'checkbox' },
  { key: 'emoji', label: 'อีโมจิหัวแบนเนอร์' },
  { key: 'title', label: 'หัวข้อหลัก' },
  { key: 'markets', label: 'บรรทัดรายชื่อหวย (คั่นด้วย •)' },
  { key: 'promo', label: 'ข้อความโปรโมชัน' },
  { key: 'cta_bet', label: 'ข้อความปุ่มแทงหวย' },
  { key: 'cta_register', label: 'ข้อความปุ่มสมัครสมาชิก' },
  { key: 'show_stats', label: 'แสดงแถบสถิติ (รอบเปิดรับ/ตลาด/อัตราจ่าย)', type: 'checkbox' },
  { key: 'show_results_ticker', label: 'แสดงข้อความวิ่ง ผลรางวัลล่าสุด (ใต้เมนู)', type: 'checkbox' },
  { key: 'show_winners_ticker', label: 'แสดงข้อความวิ่ง ผู้ชนะล่าสุด', type: 'checkbox' },
];

const DEFAULT_ANNOUNCEMENT = { enabled: true, text: '' };

export default function AdminBanner() {
  const [form, setForm] = useState(DEFAULT_BANNER);
  const [announce, setAnnounce] = useState(DEFAULT_ANNOUNCEMENT);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');

  const load = useCallback(() => {
    setLoading(true); setLoadErr('');
    api('/admin/settings').then(r => {
      const s = r.settings.find(x => x.key === 'homepage_banner');
      if (s?.value && typeof s.value === 'object') setForm({ ...DEFAULT_BANNER, ...s.value });
      const a = r.settings.find(x => x.key === 'announcement');
      if (a?.value && typeof a.value === 'object') setAnnounce({ ...DEFAULT_ANNOUNCEMENT, ...a.value });
    }).catch(e => setLoadErr(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setMsg('');
    if (!(await confirmAction({ title: 'ยืนยันบันทึกแบนเนอร์', message: 'บันทึกการเปลี่ยนแปลงแบนเนอร์หน้าแรกและประกาศ?\nการเปลี่ยนจะมีผลกับผู้ใช้ทุกคนทันที' }))) return;
    try {
      await api('/admin/settings/homepage_banner', { method: 'PUT', body: { value: form } });
      await api('/admin/settings/announcement', { method: 'PUT', body: { value: announce } });
      setMsg('บันทึกแบนเนอร์และประกาศแล้ว — หน้าแรกจะอัปเดตทันที');
      toast('บันทึกแบนเนอร์และประกาศแล้ว', 'success');
    } catch (e) { setMsg('ERROR: ' + e.message); toast(e.message, 'error'); }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  if (loading) return <AdminLoading label="กำลังโหลดแบนเนอร์..." />;
  if (loadErr) return <AdminError message={loadErr} onRetry={load} />;

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold [color:var(--white)]">จัดการแบนเนอร์หน้าแรก</h1>
        <p className="text-sm mt-1 [color:var(--light-gray)]">แก้ไขข้อความและปุ่มบนแบนเนอร์ด้านบนของหน้าแรก — บันทแล้วมีผลทันที</p>
      </div>
      {msg && <div className={`text-sm rounded-lg p-3 border`} style={msg.startsWith('ERROR') ? { color: 'var(--danger-red)', background: 'color-mix(in srgb, var(--danger-red) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--danger-red) 30%, transparent)' } : { color: 'var(--success-green)', background: 'color-mix(in srgb, var(--success-green) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--success-green) 30%, transparent)' }}>{msg}</div>}

      {/* Preview */}
      <Card className="[background:var(--bg-card)] [border:1px_solid_var(--border-light)] [border-radius:var(--radius-xl)]">
        <CardBody>
        <div className="text-xs mb-2 [color:var(--muted-gray)]">ตัวอย่าง (ใกล้เคียงของจริง)</div>
        <div className="rounded-xl px-4 py-5 text-center [border:1px_solid_var(--border-gold)] [background:linear-gradient(to_bottom_right,_var(--bg-dark-surface),_var(--bg-deep-black))]">
          <div className="text-2xl mb-1">{form.emoji}</div>
          <div className="text-lg font-black [color:var(--gold-primary)]">{form.title}</div>
          <div className="text-xs mt-1 [color:var(--light-gray)]">{form.markets}</div>
          <div className="text-xs mt-1 [color:var(--gold-primary)] [opacity:0.9]">{form.promo}</div>
          <div className="flex justify-center gap-2 mt-3">
            <span className="text-xs font-bold px-4 py-1.5 rounded-lg [background:var(--gold-primary)] [color:var(--bg-deep-black)]">{form.cta_bet}</span>
            <span className="text-xs px-4 py-1.5 rounded-lg [border:1px_solid_var(--border-gold)] [color:var(--gold-primary)]">{form.cta_register}</span>
          </div>
        </div>
        </CardBody>
      </Card>

      {/* แถบประกาศวิ่ง */}
      <Card className="[background:var(--bg-card)] [border:1px_solid_var(--border-light)] [border-radius:var(--radius-xl)]">
        <CardBody className="space-y-3">
        <div className="text-sm font-bold [color:var(--white)]">📢 แถบประกาศ (ข้อความวิ่งใต้เมนู)</div>
        <label className="flex items-center gap-2 text-sm [color:var(--light-gray)]">
          <input type="checkbox" checked={!!announce.enabled} onChange={e => setAnnounce(a => ({ ...a, enabled: e.target.checked }))}
            className="w-5 h-5 [accent-color:var(--gold-primary)]" />
          แสดงแถบประกาศ
        </label>
        <input value={announce.text ?? ''} onChange={e => setAnnounce(a => ({ ...a, text: e.target.value }))}
          placeholder="เช่น ยินดีต้อนรับสู่ Devin Lottery —Experiences..."
          className="w-full rounded-lg px-3 py-2 text-sm [background:var(--bg-dark-surface)] [border:1px_solid_var(--border-light)] [color:var(--white)]" />
        {announce.enabled && announce.text && (
          <div className="rounded-lg overflow-hidden [background:var(--bg-dark-surface)] [border:1px_solid_var(--border-gold)]">
            <div className="flex items-center">
              <span className="shrink-0 px-3 py-1 text-[10px] font-bold border-r [color:var(--gold-primary)] [background:color-mix(in_srgb,var(--gold-primary)_15%,transparent)] [border-color:var(--border-gold)]">📢 ประกาศ</span>
              <div className="overflow-hidden flex-1 py-1">
                <div className="flex w-max animate-marquee gap-12 px-3">
                  {[0, 1].map(n => <span key={n} className="text-[11px] whitespace-nowrap [color:var(--white)]">{announce.text}</span>)}
                </div>
              </div>
            </div>
          </div>
        )}
        </CardBody>
      </Card>

      <Card className="divide-y [background:var(--bg-card)] [border:1px_solid_var(--border-light)] [border-radius:var(--radius-xl)] [border-color:var(--border-light)]">
        {FIELDS.map(f => (
          <div key={f.key} className="p-4 flex items-center gap-4 [border-color:var(--border-light)]">
            <label className="w-64 shrink-0 text-sm [color:var(--light-gray)]">{f.label}</label>
            {f.type === 'checkbox' ? (
              <input type="checkbox" checked={!!form[f.key]} onChange={e => set(f.key, e.target.checked)}
                className="w-5 h-5 [accent-color:var(--gold-primary)]" />
            ) : (
              <input value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)}
                className="flex-1 rounded-lg px-3 py-2 text-sm [background:var(--bg-dark-surface)] [border:1px_solid_var(--border-light)] [color:var(--white)]" />
            )}
          </div>
        ))}
      </Card>

      <div className="flex gap-3">
        <Button onClick={save} className="[background:linear-gradient(135deg,_var(--gold-gradient-start),_var(--gold-gradient-end))] [color:var(--bg-deep-black)]">บันทึกแบนเนอร์</Button>
        <Button variant="ghost" onClick={() => setForm(DEFAULT_BANNER)} className="[color:var(--gold-primary)] [border:1px_solid_var(--border-light)]">คืนค่าเริ่มต้น</Button>
      </div>
    </div>
  );
}
