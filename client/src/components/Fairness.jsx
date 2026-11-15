import { useState } from 'react';

// Provably fair — แสดง commit hash (เผยตั้งแต่เริ่ม) และ seed (เผยหลังผลออก)
// กด "ตรวจสอบ" → เรียก verify(seed) ที่ parent ส่งมา → เทียบ commit ที่คำนวณใหม่
export default function FairnessNote({ fairness, verify }) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  if (!fairness?.commit) return null;
  const check = async () => {
    if (!fairness.seed || busy) return;
    setBusy(true); setMsg('');
    try {
      const r = await verify(fairness.seed);
      setMsg(r.commit === fairness.commit ? '✓ ผลคำนวณซ้ำตรงกับ commit — ตรวจสอบผ่าน' : '✗ commit ไม่ตรง — ผลถูกแก้ไข');
    } catch (e) { setMsg('✗ ' + e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="text-[10px] font-mono text-navy-400 text-center space-y-0.5">
      <div>🔐 commit <span className="text-navy-300">{fairness.commit.slice(0, 24)}…</span></div>
      {fairness.seed ? (
        <div className="break-all">
          <span className="text-navy-500">seed </span><span className="text-navy-300">{fairness.seed}</span>
          {verify && (
            <button onClick={check} disabled={busy}
              className="ml-2 px-1.5 py-0.5 rounded border border-sky-500/50 text-sky-300 hover:bg-sky-500/10 disabled:opacity-40">
              {busy ? '...' : 'ตรวจสอบ'}
            </button>
          )}
          {msg && <div className={`mt-0.5 ${msg.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{msg}</div>}
        </div>
      ) : (
        <div className="text-navy-500">seed จะถูกเผยหลังผลออก — ใครก็ตรวจสอบย้อนหลังได้</div>
      )}
    </div>
  );
}
