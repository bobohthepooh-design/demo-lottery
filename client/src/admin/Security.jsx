import { useEffect, useState } from 'react';
import { api, fmtDateTime } from '../api.js';
import { toast } from '../components/toast.js';
import { Card } from '../components/ui/index.js';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/shadcn/table.jsx';
import { Badge } from '../components/shadcn/badge.jsx';
import { cn } from '../lib/utils.js';

const SEV = {
  info: 'border-sky-500/40 text-sky-300',
  warning: 'border-amber-500/40 text-amber-300',
  critical: 'border-red-500/50 text-red-300',
  low: 'border-navy-400/40 text-navy-200',
  medium: 'border-amber-500/40 text-amber-300',
  high: 'border-orange-500/50 text-orange-300',
};

const EVENT_TH = {
  'login.failed': 'เข้าสู่ระบบไม่สำเร็จ', 'login.failed_unknown_user': 'พยายามเข้าสู่ระบบด้วยบัญชีที่ไม่มี',
  'mfa.failed': 'ยืนยัน MFA ไม่สำเร็จ', 'password_reset_requested': 'มีคำขอรีเซ็ตรหัสผ่าน',
  'password.changed': 'เปลี่ยนรหัสผ่าน', 'admin.member_password_reset': 'แอดมินรีเซ็ตรหัสผ่านสมาชิก',
  'mfa.enabled': 'เปิดใช้ MFA',
  'unhandled_error': 'ข้อผิดพลาดของระบบ',
};

const SEV_LABEL = { info: 'ข้อมูล', low: 'ต่ำ', medium: 'กลาง', high: 'สูง', critical: 'วิกฤต' };
const FLAG_SEV = {
  info: 'border-sky-500/40 text-sky-300', low: 'border-navy-400/40 text-navy-200',
  medium: 'border-amber-500/40 text-amber-300', high: 'border-orange-500/50 text-orange-300',
  critical: 'border-red-500/50 text-red-300',
};

export default function AdminSecurity() {
  const [events, setEvents] = useState([]);
  const [flags, setFlags] = useState([]);
  const [flagStatus, setFlagStatus] = useState('open');
  const load = () => {
    api('/admin/security-events?limit=50').then(r => setEvents(r.events)).catch(e => toast(e.message, 'error'));
    api(`/admin/risk/flags?status=${flagStatus}`).then(r => setFlags(r.flags || [])).catch(() => {});
  };
  useEffect(load, [flagStatus]);

  const setFlag = async (f, status) => {
    const note = status === 'resolved' ? (prompt('หมายเหตุการปิด flag (ไม่บังคับ):') ?? '') : '';
    if (status === 'resolved' && note === null) return;
    try {
      await api(`/admin/risk/flags/${f.id}/status`, { method: 'POST', body: { status, note } });
      toast(status === 'resolved' ? 'ปิด flag แล้ว' : 'รับทราบ flag แล้ว', 'success');
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold [color:var(--white)]">Security Monitoring</h1>

      {/* Risk flags — rule engine per member */}
      <Card className="[background:var(--bg-card)] [border:1px_solid_var(--border-light)] [border-radius:var(--radius-xl)]">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div>
            <div className="font-bold [color:var(--white)]">⚠️ Risk Flags ({flags.length})</div>
            <div className="text-[11px] [color:var(--muted-gray)]">สัญญาณเฝ้าระวังจาก rule-based heuristics — daily scan อัตโนมัติ + คำนวณสดใน Member 360</div>
          </div>
          <div className="flex gap-1">
            {['open', 'acknowledged', 'resolved'].map(s => (
              <button key={s} onClick={() => setFlagStatus(s)}
                className={`text-[11px] px-2.5 py-1 rounded-lg border ${flagStatus === s ? 'bg-[color-mix(in_srgb,var(--gold-primary)_20%,transparent)] border-[color-mix(in_srgb,var(--gold-primary)_50%,transparent)] text-[var(--gold-primary)]' : 'border-[var(--border-light)] text-[var(--muted-gray)]'}`}>
                {s === 'open' ? 'เปิดอยู่' : s === 'acknowledged' ? 'รับทราบแล้ว' : 'ปิดแล้ว'}
              </button>
            ))}
          </div>
        </div>
        <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent [border-color:var(--border-light)]">
              <TableHead className="[color:var(--muted-gray)]">สมาชิก</TableHead>
              <TableHead className="[color:var(--muted-gray)]">Flag</TableHead>
              <TableHead className="[color:var(--muted-gray)]">ระดับ</TableHead>
              <TableHead className="[color:var(--muted-gray)] [text-align:right]">Score</TableHead>
              <TableHead className="[color:var(--muted-gray)]">รายละเอียด</TableHead>
              <TableHead className="[color:var(--muted-gray)]">พบล่าสุด</TableHead>
              {flagStatus !== 'resolved' && <TableHead className="[color:var(--muted-gray)]">จัดการ</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {flags.map(f => (
              <TableRow key={f.id} className="[border-color:var(--border-light)]">
                <TableCell className="text-xs [color:var(--white)]">{f.username}<div className="text-[10px] [color:var(--dark-gray)]">{f.display_name || ''}</div></TableCell>
                <TableCell className="text-xs [color:var(--light-gray)]">{f.code}<div className="text-[10px] [color:var(--muted-gray)]">{f.detail || ''}</div></TableCell>
                <TableCell><Badge variant="outline" className={cn('text-[10px] font-bold uppercase', FLAG_SEV[f.severity])}>{SEV_LABEL[f.severity] || f.severity}</Badge></TableCell>
                <TableCell className="text-xs font-bold [color:var(--gold-primary)] [text-align:right]">{f.score}</TableCell>
                <TableCell className="text-[11px] max-w-[220px] truncate [color:var(--muted-gray)]">{f.note || '—'}</TableCell>
                <TableCell className="text-xs whitespace-nowrap [color:var(--muted-gray)]">{fmtDateTime(f.last_seen_at)}</TableCell>
                {flagStatus !== 'resolved' && (
                  <TableCell>
                    <div className="flex gap-1.5">
                      {f.status === 'open' && <button onClick={() => setFlag(f, 'acknowledged')} className="text-[11px] hover:underline [color:var(--info-blue)]">รับทราบ</button>}
                      <button onClick={() => setFlag(f, 'resolved')} className="text-[11px] hover:underline [color:var(--success-green)]">ปิด</button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {!flags.length && <TableRow><TableCell colSpan="7" className="text-center py-6 text-xs [color:var(--muted-gray)]">ไม่มี risk flag ในสถานะนี้</TableCell></TableRow>}
          </TableBody>
        </Table>
        </div>
        <div className="lg:hidden p-3 space-y-3">
          {flags.map(f => (
            <div key={f.id} className="border border-[var(--border-light)] rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-bold [color:var(--white)]">{f.username}
                  <div className="text-[10px] font-normal [color:var(--dark-gray)]">{f.display_name || ''}</div>
                </div>
                <Badge variant="outline" className={cn('text-[10px] font-bold uppercase', FLAG_SEV[f.severity])}>{SEV_LABEL[f.severity] || f.severity}</Badge>
              </div>
              <div className="text-xs [color:var(--light-gray)]">{f.code}
                {f.detail && <div className="text-[10px] [color:var(--muted-gray)]">{f.detail}</div>}
              </div>
              <div className="text-xs flex justify-between gap-2"><span className="[color:var(--muted-gray)]">Score</span><span className="font-bold [color:var(--gold-primary)]">{f.score}</span></div>
              <div className="text-xs flex justify-between gap-2"><span className="[color:var(--muted-gray)]">พบล่าสุด</span><span className="[color:var(--muted-gray)]">{fmtDateTime(f.last_seen_at)}</span></div>
              <div className="text-xs [color:var(--muted-gray)]">{f.note || '—'}</div>
              {flagStatus !== 'resolved' && (
                <div className="flex gap-3 pt-1">
                  {f.status === 'open' && <button onClick={() => setFlag(f, 'acknowledged')} className="text-[11px] hover:underline [color:var(--info-blue)]">รับทราบ</button>}
                  <button onClick={() => setFlag(f, 'resolved')} className="text-[11px] hover:underline [color:var(--success-green)]">ปิด</button>
                </div>
              )}
            </div>
          ))}
          {!flags.length && <div className="text-center py-6 text-xs [color:var(--muted-gray)]">ไม่มี risk flag ในสถานะนี้</div>}
        </div>
      </Card>

      <Card className="[background:var(--bg-card)] [border:1px_solid_var(--border-light)] [border-radius:var(--radius-xl)]">
        <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent [border-color:var(--border-light)]">
              <TableHead className="[color:var(--muted-gray)]">เวลา</TableHead>
              <TableHead className="[color:var(--muted-gray)]">เหตุการณ์</TableHead>
              <TableHead className="[color:var(--muted-gray)]">ระดับ</TableHead>
              <TableHead className="[color:var(--muted-gray)]">ผู้ใช้</TableHead>
              <TableHead className="[color:var(--muted-gray)]">IP</TableHead>
              <TableHead className="[color:var(--muted-gray)]">รายละเอียด</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map(e => (
              <TableRow key={e.id} className="[border-color:var(--border-light)]">
                <TableCell className="text-xs whitespace-nowrap [color:var(--muted-gray)]">{fmtDateTime(e.created_at)}</TableCell>
                <TableCell>
                  <div className="text-xs [color:var(--white)]">{EVENT_TH[e.event_type] || e.event_type}</div>
                  {EVENT_TH[e.event_type] && <code className="text-[10px] [color:var(--dark-gray)]">{e.event_type}</code>}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn('text-[10px] font-bold uppercase', SEV[e.severity])}>{e.severity}</Badge>
                </TableCell>
                <TableCell className="text-xs [color:var(--muted-gray)]">{e.username || '—'}</TableCell>
                <TableCell className="text-xs [color:var(--muted-gray)]">{e.ip}</TableCell>
                <TableCell className="text-xs max-w-[300px] truncate font-mono [color:var(--muted-gray)]">{e.detail || '—'}</TableCell>
              </TableRow>
            ))}
            {!events.length && <TableRow><TableCell colSpan="6" className="text-center py-8 [color:var(--muted-gray)]">ไม่มีเหตุการณ์</TableCell></TableRow>}
          </TableBody>
        </Table>
        </div>
        <div className="lg:hidden p-3 space-y-3">
          {events.map(e => (
            <div key={e.id} className="border border-[var(--border-light)] rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold [color:var(--white)]">{EVENT_TH[e.event_type] || e.event_type}</div>
                <Badge variant="outline" className={cn('text-[10px] font-bold uppercase', SEV[e.severity])}>{e.severity}</Badge>
              </div>
              {EVENT_TH[e.event_type] && <code className="text-[10px] [color:var(--dark-gray)]">{e.event_type}</code>}
              <div className="text-xs flex justify-between gap-2"><span className="[color:var(--muted-gray)]">เวลา</span><span className="[color:var(--muted-gray)]">{fmtDateTime(e.created_at)}</span></div>
              <div className="text-xs flex justify-between gap-2"><span className="[color:var(--muted-gray)]">ผู้ใช้</span><span className="[color:var(--muted-gray)]">{e.username || '—'}</span></div>
              <div className="text-xs flex justify-between gap-2"><span className="[color:var(--muted-gray)]">IP</span><span className="[color:var(--muted-gray)]">{e.ip}</span></div>
              <div className="text-xs font-mono [color:var(--muted-gray)] break-all">{e.detail || '—'}</div>
            </div>
          ))}
          {!events.length && <div className="text-center py-8 [color:var(--muted-gray)]">ไม่มีเหตุการณ์</div>}
        </div>
      </Card>
    </div>
  );
}
