import { useEffect, useState } from 'react';
import { api, fmtDateTime } from '../api.js';
import { toast } from '../components/toast.js';

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

// export CSV — BOM ให้ Excel เปิดภาษาไทยได้
function exportCsv(rows, filename) {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['เวลา', 'ผู้ใช้', 'Action', 'Entity', 'IP', 'รายละเอียด'];
  const lines = [head.join(',')];
  for (const l of rows) {
    lines.push([l.created_at, l.username || `#${l.user_id}`, ACTION_TH[l.action] || l.action,
      `${l.entity_type || ''} ${l.entity_id || ''}`, l.ip || '', l.detail || ''].map(esc).join(','));
  }
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function AdminAudit() {
  const [logs, setLogs] = useState([]);
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  useEffect(() => { api('/admin/audit?limit=300').then(r => setLogs(r.logs)).catch(e => toast(e.message, 'error')); }, []);

  const actionKeys = [...new Set(logs.map(l => l.action))].sort();
  const filtered = logs.filter(l => {
    if (action && l.action !== action) return false;
    if (!q.trim()) return true;
    const t = q.trim().toLowerCase();
    return [l.username, l.entity_type, l.entity_id, l.ip, l.detail, ACTION_TH[l.action]]
      .filter(Boolean).some(v => String(v).toLowerCase().includes(t));
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-white">Audit Log</h1>
        <div className="flex items-center gap-2">
          <input value={q} onChange={e => { setQ(e.target.value); setPage(0); }}
            placeholder="ค้นหา ผู้ใช้ / entity / IP / รายละเอียด..."
            className="bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 text-sm w-64" />
          <select value={action} onChange={e => { setAction(e.target.value); setPage(0); }}
            className="bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 text-sm">
            <option value="">ทุก action</option>
            {actionKeys.map(k => <option key={k} value={k}>{ACTION_TH[k] || k}</option>)}
          </select>
          <button onClick={() => exportCsv(filtered, `audit-${new Date().toISOString().slice(0, 10)}.csv`)}
            className="bg-navy-900 border border-navy-600 hover:border-gold-500/50 text-navy-200 hover:text-gold-300 text-sm px-3 py-2 rounded-lg transition"
            title="ดาวน์โหลดผลลัพธ์ที่กรองอยู่เป็น CSV">
            ⬇ CSV
          </button>
        </div>
      </div>
      <div className="bg-navy-800 border border-navy-700 rounded-xl overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-navy-900 text-navy-300">
            <tr><th className="text-left px-3 py-3">เวลา</th><th className="text-left px-3 py-3">ผู้ใช้</th><th className="text-left px-3 py-3">Action</th><th className="text-left px-3 py-3">Entity</th><th className="text-left px-3 py-3">IP</th><th className="text-left px-3 py-3">รายละเอียด</th></tr>
          </thead>
          <tbody className="divide-y divide-navy-700">
            {paged.map(l => (
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
        {!filtered.length && <div className="text-center text-navy-400 py-8 text-sm">{logs.length ? 'ไม่พบรายการที่ตรงกับตัวกรอง' : 'ไม่มีรายการ'}</div>}
      </div>
      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-navy-400">หน้า {page + 1}/{pageCount} • {filtered.length} รายการ</span>
          <div className="flex gap-2">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-lg border border-navy-600 text-navy-200 disabled:opacity-40 hover:border-gold-500/50">← ก่อนหน้า</button>
            <button disabled={page >= pageCount - 1} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-navy-600 text-navy-200 disabled:opacity-40 hover:border-gold-500/50">ถัดไป →</button>
          </div>
        </div>
      )}
    </div>
  );
}
