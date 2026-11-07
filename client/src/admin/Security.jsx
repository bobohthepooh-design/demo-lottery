import { useEffect, useState } from 'react';
import { api } from '../api.js';

const SEV = { info: 'text-blue-300', warning: 'text-yellow-300', critical: 'text-red-400' };

export default function AdminSecurity() {
  const [events, setEvents] = useState([]);
  useEffect(() => { api('/admin/security-events?limit=300').then(r => setEvents(r.events)).catch(e => alert(e.message)); }, []);

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
                <td className="px-4 py-2 text-navy-300 whitespace-nowrap text-xs">{e.created_at}</td>
                <td className="px-4 py-2"><code className="text-gold-300 text-xs">{e.event_type}</code></td>
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
