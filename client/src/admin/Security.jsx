import { useEffect, useState } from 'react';
import { api, fmtDateTime } from '../api.js';
import { toast } from '../components/toast.js';

const SEV = { info: 'text-blue-300', warning: 'text-yellow-300', critical: 'text-red-400' };

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
      <div className="bg-navy-800 border border-navy-700 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-navy-900 text-navy-300 text-xs">
            <tr><th className="text-left px-4 py-3">เวลา</th><th className="text-left px-4 py-3">เหตุการณ์</th><th className="text-left px-4 py-3">ระดับ</th><th className="text-left px-4 py-3">ผู้ใช้</th><th className="text-left px-4 py-3">IP</th><th className="text-left px-4 py-3">รายละเอียด</th></tr>
          </thead>
          <tbody className="divide-y divide-navy-700">
            {events.map(e => (
              <tr key={e.id} className="hover:bg-navy-700/40">
                <td className="px-4 py-2 text-navy-300 whitespace-nowrap text-xs">{fmtDateTime(e.created_at)}</td>
                <td className="px-4 py-2">
                  <div className="text-white text-xs">{EVENT_TH[e.event_type] || e.event_type}</div>
                  {EVENT_TH[e.event_type] && <code className="text-navy-500 text-[10px]">{e.event_type}</code>}
                </td>
                <td className={`px-4 py-2 text-xs font-bold ${SEV[e.severity] || ''}`}>{e.severity}</td>
                <td className="px-4 py-2 text-navy-300 text-xs">{e.username || '—'}</td>
                <td className="px-4 py-2 text-navy-300 text-xs">{e.ip}</td>
                <td className="px-4 py-2 text-navy-300 text-xs max-w-[300px] truncate font-mono">{e.detail || '—'}</td>
              </tr>
            ))}
            {!events.length && <tr><td colSpan="6" className="px-4 py-8 text-center text-navy-400">ไม่มีเหตุการณ์</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
