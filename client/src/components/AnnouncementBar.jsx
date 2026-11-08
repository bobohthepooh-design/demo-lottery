import { useEffect, useState } from 'react';
import { api } from '../api.js';

// แถบข้อความวิ่งประกาศ — admin ตั้งค่าได้ที่ /admin/banner (setting: announcement)
export default function AnnouncementBar() {
  const [text, setText] = useState('');

  useEffect(() => {
    api('/lottery/public-config').then(r => {
      const a = r.announcement;
      if (a && a.enabled && a.text) setText(String(a.text));
    }).catch(() => {});
  }, []);

  if (!text) return null;

  return (
    <div className="bg-gradient-to-r from-gold-500/20 via-gold-500/10 to-gold-500/20 border-b border-gold-500/30 overflow-hidden">
      <div className="flex items-center">
        <span className="shrink-0 px-3 py-1.5 text-[11px] font-bold text-gold-300 bg-gold-500/15 border-r border-gold-500/30">
          📢 ประกาศ
        </span>
        <div className="overflow-hidden flex-1 py-1.5">
          <div className="flex w-max animate-marquee gap-12 px-4">
            {[0, 1].map(n => (
              <span key={n} className="text-xs text-navy-100 whitespace-nowrap">{text}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
