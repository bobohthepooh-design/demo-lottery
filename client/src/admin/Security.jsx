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

export default function AdminSecurity() {
  const [events, setEvents] = useState([]);
  useEffect(() => { api('/admin/security-events?limit=50').then(r => setEvents(r.events)).catch(e => toast(e.message, 'error')); }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Security Monitoring</h1>
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
