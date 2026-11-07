import { useEffect, useState } from 'react';
import { api } from '../api.js';

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
                <td className="px-3 py-2 text-navy-300 whitespace-nowrap">{l.created_at}</td>
                <td className="px-3 py-2 text-white">{l.username || `#${l.user_id}`}</td>
                <td className="px-3 py-2"><code className="text-gold-300">{l.action}</code></td>
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
