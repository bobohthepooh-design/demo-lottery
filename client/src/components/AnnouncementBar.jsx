import { useEffect, useState } from 'react';
import { api } from '../api.js';

// แถบข้อความวิ่งประกาศ — admin ตั้งค่าได้ที่ /admin/banner (setting: announcement)
// สไตล์การ์ดเดียวกับ ticker ผลรางวัลล่าสุดในหน้าแรก
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
    <div className="max-w-7xl w-full mx-auto px-4 pt-3">
      <div className="bg-navy-800/80 border border-red-500/40 rounded-xl overflow-hidden shadow-[0_0_18px_rgba(225,29,72,0.15)]">
        <div className="flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-red-700/60 via-red-600/40 to-red-700/60 border-b border-red-500/40">
          <span className="text-xs font-black text-red-200 tracking-wider">📢 ประกาศ</span>
          <span className="text-[10px] text-red-200/60">(ชี้เพื่อหยุดเลื่อน)</span>
        </div>
        <div className="overflow-hidden py-1.5">
          <div className="flex w-max animate-marquee gap-8 px-4">
            {[...Array(4)].map((_, n) => (
              <span key={n} className="text-xs text-navy-200 whitespace-nowrap flex items-center gap-1.5">
                {text}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
