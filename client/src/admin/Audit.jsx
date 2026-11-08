import { useEffect, useState } from 'react';
import { api, fmtDateTime } from '../api.js';

const ACTION_TH = {
  'user.login': 'เข้าสู่ระบบ', 'user.login_line': 'เข้าสู่ระบบ (LINE)',
  'user.logout': 'ออกจากระบบ', 'user.register': 'สมัครสมาชิก',
  'user.register_line': 'สมัครสมาชิก (LINE)', 'user.change_password': 'เปลี่ยนรหัสผ่าน',
  'user.password_reset_requested': 'ขอรีเซ็ตรหัสผ่าน',
  'user.mfa_enabled': 'เปิดใช้ MFA', 'user.mfa_verified': 'ยืนยัน MFA',
  'user.locked_bruteforce': 'บัญชีถูกล็อกจากการพยายามเข้าผิดบ่อย',
  'bet.place': 'ส่งโพยเดิมพัน', 'draw.settle': 'ออกผลรางวัล',
  'draw.auto_settle': 'ออกผลอัตโนมัติ', 'draw.result_update': 'แก้ไขผลย้อนหลัง',
  'draw.create': 'สร้างรอบหวย', 'draw.update': 'แก้ไขรอบหวย', 'draw.status': 'เปลี่ยนสถานะรอบ',
  'admin.member_update': 'แก้ไขข้อมูลสมาชิก', 'admin.member_delete': 'ลบสมาชิก',
  'admin.roles_update': 'แก้ไขสิทธิ์การใช้งาน',
  'admin.lottery_type_create': 'สร้างประเภทหวย', 'admin.lottery_type_update': 'แก้ไขประเภทหวย',
  'admin.rule_create': 'สร้างกติกาการแทง', 'admin.rule_update': 'แก้ไขกติกาการแทง',
  'admin.setting_update': 'แก้ไขการตั้งค่าระบบ',
  'wallet.deposit': 'เติมเครดิต', 'wallet.withdraw': 'ถอนเครดิต',
  'wallet.credit_adjust': 'แอดมินเพิ่มเครดิต', 'wallet.debit_adjust': 'แอดมินหักเครดิต',
};

export default function AdminAudit() {
  const [logs, setLogs] = useState([]);
  useEffect(() => { api('/admin/audit?limit=300').then(r => setLogs(r.logs)).catch(e => alert(e.message)); }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Audit Log</h1>
      <div className="bg-navy-800 border border-navy-700 rounded-xl overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-navy-900 text-navy-300">
            <tr><th className="text-left px-3 py-3">เวลา</th><th className="text-left px-3 py-3">ผู้ใช้</th><th className="text-left px-3 py-3">Action</th><th className="text-left px-3 py-3">Entity</th><th className="text-left px-3 py-3">IP</th><th className="text-left px-3 py-3">รายละเอียด</th></tr>
          </thead>
          <tbody className="divide-y divide-navy-700">
            {logs.map(l => (
              <tr key={l.id} className="hover:bg-navy-700/40">
                <td className="px-3 py-2 text-navy-300 whitespace-nowrap">{fmtDateTime(l.created_at)}</td>
                <td className="px-3 py-2 text-white">{l.username || `#${l.user_id}`}</td>
                <td className="px-3 py-2">
                  <div className="text-white">{ACTION_TH[l.action] || l.action}</div>
                  {ACTION_TH[l.action] && <code className="text-navy-500 text-[10px]">{l.action}</code>}
                </td>
                <td className="px-3 py-2 text-navy-300">{l.entity_type} {l.entity_id}</td>
                <td className="px-3 py-2 text-navy-300">{l.ip}</td>
                <td className="px-3 py-2 text-navy-300 max-w-[300px] truncate font-mono">{l.detail || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
