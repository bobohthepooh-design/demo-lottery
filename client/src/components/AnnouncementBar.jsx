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
      <div className="bg-navy-800/80 border border-royal/40 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-1.5 bg-royal/15 border-b border-royal/30">
          <span className="text-xs font-bold text-royal-soft">📢 ประกาศ</span>
          <span className="text-[10px] text-navy-400">(ชี้เพื่อหยุดเลื่อน)</span>
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
