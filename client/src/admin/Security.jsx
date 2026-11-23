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
      <h1 className="text-2xl font-bold text-white">Security Monitoring</h1>

      {/* Risk flags — rule engine per member */}
      <Card>
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div>
            <div className="font-bold text-white">⚠️ Risk Flags ({flags.length})</div>
            <div className="text-[11px] text-navy-400">สัญญาณเฝ้าระวังจาก rule-based heuristics — daily scan อัตโนมัติ + คำนวณสดใน Member 360</div>
          </div>
          <div className="flex gap-1">
            {['open', 'acknowledged', 'resolved'].map(s => (
              <button key={s} onClick={() => setFlagStatus(s)}
                className={`text-[11px] px-2.5 py-1 rounded-lg border ${flagStatus === s ? 'bg-gold-500/20 border-gold-500/50 text-gold-300' : 'border-navy-600 text-navy-300'}`}>
                {s === 'open' ? 'เปิดอยู่' : s === 'acknowledged' ? 'รับทราบแล้ว' : 'ปิดแล้ว'}
              </button>
            ))}
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-navy-700/60 hover:bg-transparent">
              <TableHead className="text-navy-400">สมาชิก</TableHead>
              <TableHead className="text-navy-400">Flag</TableHead>
              <TableHead className="text-navy-400">ระดับ</TableHead>
              <TableHead className="text-navy-400 text-right">Score</TableHead>
              <TableHead className="text-navy-400">รายละเอียด</TableHead>
              <TableHead className="text-navy-400">พบล่าสุด</TableHead>
              {flagStatus !== 'resolved' && <TableHead className="text-navy-400">จัดการ</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {flags.map(f => (
              <TableRow key={f.id} className="border-navy-700/50">
                <TableCell className="text-white text-xs">{f.username}<div className="text-navy-500 text-[10px]">{f.display_name || ''}</div></TableCell>
                <TableCell className="text-xs text-navy-200">{f.code}<div className="text-navy-400 text-[10px]">{f.detail || ''}</div></TableCell>
                <TableCell><Badge variant="outline" className={cn('text-[10px] font-bold uppercase', FLAG_SEV[f.severity])}>{SEV_LABEL[f.severity] || f.severity}</Badge></TableCell>
                <TableCell className="text-right text-xs text-gold-300 font-bold">{f.score}</TableCell>
                <TableCell className="text-navy-400 text-[11px] max-w-[220px] truncate">{f.note || '—'}</TableCell>
                <TableCell className="text-navy-300 text-xs whitespace-nowrap">{fmtDateTime(f.last_seen_at)}</TableCell>
                {flagStatus !== 'resolved' && (
                  <TableCell>
                    <div className="flex gap-1.5">
                      {f.status === 'open' && <button onClick={() => setFlag(f, 'acknowledged')} className="text-[11px] text-sky-300 hover:underline">รับทราบ</button>}
                      <button onClick={() => setFlag(f, 'resolved')} className="text-[11px] text-green-300 hover:underline">ปิด</button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {!flags.length && <TableRow><TableCell colSpan="7" className="text-center text-navy-400 py-6 text-xs">ไม่มี risk flag ในสถานะนี้</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="border-navy-700/60 hover:bg-transparent">
              <TableHead className="text-navy-400">เวลา</TableHead>
              <TableHead className="text-navy-400">เหตุการณ์</TableHead>
              <TableHead className="text-navy-400">ระดับ</TableHead>
              <TableHead className="text-navy-400">ผู้ใช้</TableHead>
              <TableHead className="text-navy-400">IP</TableHead>
              <TableHead className="text-navy-400">รายละเอียด</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map(e => (
              <TableRow key={e.id} className="border-navy-700/50">
                <TableCell className="text-navy-300 whitespace-nowrap text-xs">{fmtDateTime(e.created_at)}</TableCell>
                <TableCell>
                  <div className="text-white text-xs">{EVENT_TH[e.event_type] || e.event_type}</div>
                  {EVENT_TH[e.event_type] && <code className="text-navy-500 text-[10px]">{e.event_type}</code>}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn('text-[10px] font-bold uppercase', SEV[e.severity])}>{e.severity}</Badge>
                </TableCell>
                <TableCell className="text-navy-300 text-xs">{e.username || '—'}</TableCell>
                <TableCell className="text-navy-300 text-xs">{e.ip}</TableCell>
                <TableCell className="text-navy-300 text-xs max-w-[300px] truncate font-mono">{e.detail || '—'}</TableCell>
              </TableRow>
            ))}
            {!events.length && <TableRow><TableCell colSpan="6" className="text-center text-navy-400 py-8">ไม่มีเหตุการณ์</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
