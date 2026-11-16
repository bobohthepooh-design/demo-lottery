import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { api, satang, bahtToSatang, fmtDateTime } from '../api.js';
import { useAuth } from '../auth.jsx';
import { sfx } from '../sound.js';

const TYPE_TH = {
  initial_credit: 'เครดิตฟรี', admin_adjust: 'ปรับเครดิต(+)', admin_debit: 'ปรับเครดิต(-)',
  bet_debit: 'หักเครดิตแทง', bet_refund: 'คืนเครดิต', win_credit: 'เงินรางวัล',
  deposit: 'เติมเครดิต', withdraw: 'แลกเครดิต',
};

const PRESETS = [100, 500, 1000, 5000, 10000];

const DEPOSIT_METHODS = [
  { key: 'bank_transfer', icon: '🏦', name: 'โอนเงินเข้าธนาคาร', desc: 'โอนผ่านแอปธนาคาร' },
  { key: 'qr_promptpay', icon: '📱', name: 'QR พร้อมเพย์', desc: 'สแกนจ่ายผ่านแอปธนาคาร' },
  { key: 'truemoney', icon: '💳', name: 'TrueMoney Wallet', desc: 'สแกน/ชำระผ่าน TrueMoney' },
];

// QR ลายจำลองสำหรับ demo — ไม่ใช่ QR จริง สแกนไม่ได้
function FakeQr() {
  const n = 21;
  const cells = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const inFinder = (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
    const on = inFinder ? true : ((x * 31 + y * 17 + ((x * y) % 7)) % 3 === 0);
    cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={on ? '#1f2937' : '#ffffff'} />);
  }
  return (
    <svg viewBox={`0 0 ${n} ${n}`} className="w-28 h-28 bg-white rounded-lg border border-navy-600 p-1">
      {cells}
      {[ [0,0],[n-7,0],[0,n-7] ].map(([fx,fy],i) => (
        <g key={i}>
          <rect x={fx} y={fy} width={7} height={7} fill="none" stroke="#1f2937" strokeWidth={1.4} />
          <rect x={fx+1.5} y={fy+1.5} width={4} height={4} fill="#1f2937" />
        </g>
      ))}
    </svg>
  );
}

export default function Wallet() {
  const { balance, setBalance } = useAuth();
  const [txs, setTxs] = useState([]);
  const [wd, setWd] = useState(null); // { deposited, won, withdrawn, withdrawable, unlocked }
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // 'deposit' | 'withdraw' | null
  const [payMethod, setPayMethod] = useState('bank_transfer');
  const [accountNo, setAccountNo] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [celebration, setCelebration] = useState(null); // { kind:'win'|'lose', slip }
  const idemRef = useRef({ sig: '', key: '' }); // idempotency key ต่อ (ประเภท+จำนวน) กันกดซ้ำ/หลุดแล้วเติม-ถอนซ้ำ

  const [params, setParams] = useSearchParams();
  const load = () => api('/bets/wallet?limit=100').then(r => { setTxs(r.transactions); setBalance(r.balance); setWd(r.withdrawable || null); })
    .catch(() => {}).finally(() => setLoading(false));
  useEffect(() => {
    // ?action=deposit|withdraw — เปิด modal จากปุ่มลัดหน้าแรก
    const act = params.get('action');
    if (act === 'deposit' || act === 'withdraw') {
      setModal(act); setAmount(''); setErr('');
      setParams({}, { replace: true });
    }
    load();
    // ดึงโพยล่าสุดที่ออกผลแล้วมาแสดงอารมณ์ถูก/ไม่ถูก
    api('/bets/mine?limit=10').then(r => {
      const s = (r.slips || []).find(x => ['won', 'lost', 'partial'].includes(x.status));
      // แสดงครั้งเดียวต่อโพยต่อ session เพื่อไม่ให้รบกวนทุกครั้งที่เปิดหน้า
      if (s && sessionStorage.getItem(`celebrated-${s.slip_ref}`) !== '1') {
        sessionStorage.setItem(`celebrated-${s.slip_ref}`, '1');
        setCelebration({ kind: s.status === 'lost' ? 'lose' : 'win', slip: s });
        if (s.status === 'lost') sfx.lose(); else sfx.win();
      }
    }).catch(() => {});
  }, []);

  const doAction = async () => {
    setErr('');
    const satangAmt = bahtToSatang(amount);
    if (!satangAmt || satangAmt < 100) return setErr('กรอกจำนวนเงินอย่างน้อย 1 บาท');
    if (satangAmt > 1000000) return setErr('สูงสุด 10,000 บาทต่อรายการ');
    if (modal === 'withdraw') {
      if (wd && !wd.unlocked) return setErr('ต้องเติมเครดิตขั้นต่ำ 100 บาท ก่อนจึงจะสามารถแลกเครดิตได้');
      if (wd && satangAmt > wd.withdrawable) return setErr(`แลกได้สูงสุด ${satang(wd.withdrawable)} บาท (เฉพาะเงินรางวัล)`);
    }
    setBusy(true);
    try {
      const sig = `${modal}:${satangAmt}`;
      if (idemRef.current.sig !== sig) idemRef.current = { sig, key: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`) };
      const r = await api('/bets/wallet/action', { method: 'POST', body: { direction: modal, amount: satangAmt, paymentMethod: payMethod, idempotencyKey: idemRef.current.key, ...(accountNo ? { accountNo } : {}) } });
      setBalance(r.balance);
      setModal(null); setAmount(''); idemRef.current = { sig: '', key: '' };
      load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  // สรุปยอดเดิมพัน/รางวัล วันนี้และ 7 วัน (คำนวณจากธุรกรรมที่โหลด — สูงสุด 100 รายการล่าสุด)
  const txTime = (t) => { const d = new Date(String(t.created_at || '').replace(' ', 'T') + 'Z'); return isNaN(d) ? 0 : d.getTime(); };
  const summarize = (days) => {
    const since = Date.now() - days * 864e5;
    let stake = 0, win = 0;
    for (const t of txs) {
      if (txTime(t) < since) continue;
      if (t.type === 'bet_debit') stake += t.amount;
      else if (t.type === 'win_credit' || t.type === 'bet_refund') win += t.amount;
    }
    return { stake, win };
  };
  const sumToday = summarize(1), sumWeek = summarize(7);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-gradient-to-br from-[#f7ecc4] via-[#efd78f] to-[#e3c05c] border border-gold-500/40 rounded-2xl p-8 text-center shadow-[0_0_24px_rgba(226,168,18,0.15)]">
        <div className="text-sm font-bold text-navy-950/80">ยอดเครดิตจำลองคงเหลือ</div>
        <div className="text-5xl font-black text-black mt-2 drop-shadow-[0_1px_0_rgba(255,255,255,0.35)]">{satang(balance)} บาท</div>
        <div className="flex items-center justify-center gap-3 mt-5 flex-wrap">
          <button onClick={() => { setModal('deposit'); setAmount(''); setErr(''); }}
            className="bg-navy-950 text-gold-300 font-bold px-6 py-2.5 rounded-xl hover:bg-navy-900 transition shadow-lg">
            ＋ เติมเครดิต
          </button>
          <button onClick={() => { setModal('withdraw'); setAmount(''); setErr(''); }}
            className="bg-navy-950 text-gold-300 font-bold px-6 py-2.5 rounded-xl hover:bg-navy-900 transition shadow-lg">
            － แลกเครดิต
          </button>
        </div>
        {wd && (
          <div className={`text-xs mt-3 font-semibold ${wd.pendingSlips > 0 ? 'text-amber-800' : wd.unlocked ? 'text-green-800' : 'text-amber-800'}`}>
            {wd.pendingSlips > 0 && (
              <div className="mb-1">⏳ มีโพย {wd.pendingSlips} รายการค้างผล ({satang(wd.pendingStake)} บาท) — สปิน/ทายหรือลงผล หรือยกเลิกโพย-บัตรเกมเพื่อคืนเครดิตก่อนแลกได้</div>
            )}
            {wd.unlocked
              ? wd.override
                ? balance < 5000
                  ? `✅ ได้รับอนุญาตให้แลกเครดิตจากแอดมิน — แต่ยอดคงเหลือ ${satang(balance)} บาท ต่ำกว่า 50 บาท แลกไม่ได้`
                  : `✅ ได้รับอนุญาตให้แลกเครดิตจากแอดมิน — แลกได้ ${satang(wd.withdrawable)} บาท (ยอดสุทธิหักเครดิตแถม)`
                : `✅ แลกได้ ${satang(wd.withdrawable)} บาท (ยอดคงเหลือหักเครดิตแถม)`
              : `🔒 แลกเครดิตได้หลังเติมเครดิตครบ 100 บาท — เติมแล้ว ${satang(wd.deposited)} บาท`}
          </div>
        )}
        <div className="text-xs text-navy-950/70 mt-2 font-semibold">⚠️ เครดิตเสมือนสำหรับ Demo เท่านั้น — ไม่ใช่เงินจริงและไม่สามารถแลกเป็นเงินจริงได้</div>
      </div>

      {/* สรุปยอดเดิมพัน/รางวัล */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[['แทงวันนี้', sumToday.stake, 'text-red-300'], ['รางวัลวันนี้', sumToday.win, 'text-green-300'], ['แทง 7 วัน', sumWeek.stake, 'text-red-300'], ['รางวัล 7 วัน', sumWeek.win, 'text-green-300']].map(([label, v, cls]) => (
          <div key={label} className="bg-navy-800 border border-navy-700 rounded-xl px-4 py-3 text-center">
            <div className="text-[11px] text-navy-400">{label}</div>
            <div className={`text-lg font-bold ${cls}`}>{satang(v)} ฿</div>
          </div>
        ))}
      </div>

      <div className="bg-navy-800 border border-navy-700 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-navy-700 font-bold text-white">ประวัติธุรกรรมเครดิต</div>
        {/* มือถือ/แท็บเล็ต: การ์ดเรียงแนวตั้ง ไม่ล้นจอ */}
        <div className="md:hidden divide-y divide-navy-700">
          {txs.map(t => (
            <div key={t.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm text-white font-semibold">{TYPE_TH[t.type] || t.type}</div>
                  <div className="text-[11px] text-navy-400 font-mono truncate">{t.reference}</div>
                  {t.description && <div className="text-[11px] text-navy-300 truncate mt-0.5">{t.description}</div>}
                  <div className="text-[11px] text-navy-400 mt-0.5">{fmtDateTime(t.created_at)}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`font-bold ${t.direction === 'credit' ? 'text-green-400' : 'text-red-400'}`}>
                    {t.direction === 'credit' ? '+' : '−'}{satang(t.amount)} บาท
                  </div>
                  <div className="text-[11px] text-gold-300">คงเหลือ {satang(t.balance_after)} บาท</div>
                </div>
              </div>
            </div>
          ))}
          {!loading && !txs.length && <div className="px-4 py-8 text-center"><span className="text-3xl">📭</span><div className="text-navy-300 mt-1">ยังไม่มีธุรกรรม — เติมเครดิตเพื่อเริ่มใช้งาน</div></div>}
          {loading && <div className="p-4 space-y-2">{[0,1,2,3].map(i => <div key={i} className="skeleton h-14 w-full" />)}</div>}
        </div>
        {/* Desktop: ตารางเต็ม */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-navy-900 text-navy-300 text-xs">
              <tr><th className="text-left px-4 py-3">อ้างอิง</th><th className="text-left px-4 py-3">ประเภท</th><th className="text-right px-4 py-3">จำนวน</th><th className="text-right px-4 py-3">คงเหลือหลังรายการ</th><th className="text-left px-4 py-3">เวลา</th><th className="text-left px-4 py-3">รายละเอียด</th></tr>
            </thead>
            <tbody className="divide-y divide-navy-700">
              {txs.map(t => (
                <tr key={t.id} className="hover:bg-navy-700/40">
                  <td className="px-4 py-3 font-mono text-xs text-navy-300">{t.reference}</td>
                  <td className="px-4 py-3 text-white">{TYPE_TH[t.type] || t.type}</td>
                  <td className={`px-4 py-3 text-right font-bold ${t.direction === 'credit' ? 'text-green-400' : 'text-red-400'}`}>
                    {t.direction === 'credit' ? '+' : '−'}{satang(t.amount)} บาท
                  </td>
                  <td className="px-4 py-3 text-right text-gold-300">{satang(t.balance_after)} บาท</td>
                  <td className="px-4 py-3 text-xs text-navy-300 whitespace-nowrap">{fmtDateTime(t.created_at)}</td>
                  <td className="px-4 py-3 text-xs text-navy-300 max-w-[200px] truncate">{t.description || '—'}</td>
                </tr>
              ))}
              {!loading && !txs.length && <tr><td colSpan="6" className="px-4 py-8 text-center"><span className="text-3xl">📭</span><div className="text-navy-300 mt-1">ยังไม่มีธุรกรรม — เติมเครดิตเพื่อเริ่มใช้งาน</div></td></tr>}
              {loading && <tr><td colSpan="6" className="px-4 py-4"><div className="space-y-2">{[0,1,2,3].map(i => <div key={i} className="skeleton h-8 w-full" />)}</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* modal เติม/ถอนเครดิต — portal ไปที่ body เช่นกัน */}
      {modal && createPortal(
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70 p-4" onClick={() => !busy && setModal(null)}>
          <div className="bg-navy-800 border border-gold-500/40 rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-1">{modal === 'deposit' ? '💰 เติมเครดิตจำลอง' : '💸 แลกเครดิตจำลอง'}</h2>
            <p className="text-xs text-navy-400 mb-4">ยอดคงเหลือปัจจุบัน {satang(balance)} บาท • สำหรับ Demo เท่านั้น</p>
            {modal === 'withdraw' && wd && (
              <div className={`text-xs rounded-lg px-3 py-2 mb-3 ${wd.unlocked ? 'bg-green-500/10 text-green-300' : 'bg-amber-500/10 text-amber-300'}`}>
                {wd.unlocked
                  ? wd.override
                    ? balance < 5000
                      ? `ได้รับอนุญาตจากแอดมินแล้ว แต่ยอดคงเหลือ ${satang(balance)} บาท ต่ำกว่า 50 บาท — แลกไม่ได้`
                      : `แลกได้ ${satang(wd.withdrawable)} บาท — ยอดสุทธิหักเครดิตแถม (ได้รับอนุญาตจากแอดมิน)`
                    : `แลกได้สูงสุด ${satang(wd.withdrawable)} บาท — ยอดคงเหลือหักเครดิตแถม (เครดิตโปรโมชั่นแลกไม่ได้)`
                  : `ยังแลกไม่ได้ — ต้องเติมเครดิตขั้นต่ำ 100 บาท ก่อน (เติมแล้ว ${satang(wd.deposited)} บาท)`}
              </div>
            )}
            {modal && (
              <div className="mb-4">
                <div className="text-xs text-navy-400 mb-1.5">{modal === 'deposit' ? 'เลือกช่องทางเติมเครดิต' : 'เลือกช่องทางรับเครดิต'} (ระบบจำลอง):</div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {DEPOSIT_METHODS.map(m => (
                    <button key={m.key} type="button" onClick={() => setPayMethod(m.key)}
                      className={`py-2 rounded-lg text-xs font-bold border transition ${payMethod === m.key ? 'bg-gold-500/20 border-gold-500 text-gold-300' : 'bg-navy-700 border-navy-600 text-navy-300 hover:border-gold-500/50'}`}>
                      <div className="text-base">{m.icon}</div>{m.name}
                    </button>
                  ))}
                </div>
                {modal === 'deposit' ? (
                <div className="bg-navy-900/60 border border-navy-700 rounded-lg p-3 text-xs text-navy-300 space-y-1.5">
                  {payMethod === 'bank_transfer' && (
                    <>
                      <div className="flex justify-between"><span>ธนาคาร</span><span className="text-white font-semibold">ธนาคารกสิกรไทย (ตัวอย่าง)</span></div>
                      <div className="flex justify-between"><span>เลขบัญชี</span><span className="font-mono text-gold-300">xxx-x-xxxxx-x</span></div>
                      <div className="flex justify-between"><span>ชื่อบัญชี</span><span className="text-white">Demo Lottery (DEMO)</span></div>
                    </>
                  )}
                  {payMethod === 'qr_promptpay' && (
                    <div className="flex items-center gap-3">
                      <FakeQr />
                      <div>
                        <div className="text-white font-semibold mb-1">สแกน QR เพื่อชำระ</div>
                        <div>พร้อมเพย์: <span className="font-mono text-gold-300">081-234-5678</span></div>
                        <div className="text-navy-400">ชื่อ: Demo Lottery (DEMO)</div>
                      </div>
                    </div>
                  )}
                  {payMethod === 'truemoney' && (
                    <>
                      <div className="flex justify-between"><span>เบอร์ TrueMoney</span><span className="font-mono text-gold-300">081-234-5678</span></div>
                      <div className="flex justify-between"><span>ชื่อผู้รับ</span><span className="text-white">Demo Lottery (DEMO)</span></div>
                      <div className="text-navy-400">ชำระผ่านแอป TrueMoney Wallet</div>
                    </>
                  )}
                  <div className="text-[11px] text-navy-400 pt-1 border-t border-navy-700">⚠️ ช่องทางทั้งหมดเป็นข้อมูลจำลอง — ระบบเติมเครดิตเข้าทันที ไม่เกี่ยวกับเงินจริง</div>
                </div>
                ) : (
                <div className="bg-navy-900/60 border border-navy-700 rounded-lg p-3 text-xs text-navy-300 space-y-2">
                  <div>กรอกเลขบัญชี/เบอร์ปลายทางที่ต้องการรับเงิน (จำลอง):</div>
                  <input value={accountNo} onChange={e => setAccountNo(e.target.value)}
                    placeholder={payMethod === 'bank_transfer' ? 'เลขบัญชีธนาคาร' : payMethod === 'qr_promptpay' ? 'เบอร์พร้อมเพย์' : 'เบอร์ TrueMoney'}
                    className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold-500" />
                  <div className="text-[11px] text-navy-400">⚠️ ระบบจำลอง — เครดิตถูกหักจากกระเป๋าทันที ไม่มีการโอนเงินจริง</div>
                </div>
                )}
              </div>
            )}
            <div className="text-xs text-navy-400 mb-1.5">เลือกจำนวนเงินที่ต้องการ{modal === 'deposit' ? 'เติม' : 'แลก'}:</div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {PRESETS.map(p => (
                <button key={p} type="button" onClick={() => setAmount(String(p))}
                  className={`py-2.5 rounded-lg text-sm font-bold border transition ${Number(amount) === p ? 'bg-gold-500 text-navy-950 border-gold-400' : 'bg-navy-700 border-navy-600 text-navy-200 hover:border-gold-500/60 hover:text-gold-300'}`}>
                  {p.toLocaleString()} บาท
                </button>
              ))}
            </div>
            <div className="text-xs text-navy-400 mb-1.5">หรือกรอกจำนวนเอง (ขั้นต่ำ 1 บาท สูงสุด 10,000 บาท):</div>
            <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
              inputMode="decimal" placeholder="0.00" autoFocus
              className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 text-xl text-center text-gold-300 focus:outline-none focus:border-gold-500" />
            {err && <div className="text-red-400 text-sm mt-2">{err}</div>}
            <div className="flex gap-3 mt-5">
              <button onClick={() => setModal(null)} disabled={busy}
                className="flex-1 border border-navy-600 text-navy-200 py-2.5 rounded-lg hover:bg-navy-700 disabled:opacity-40">
                ยกเลิก
              </button>
              <button onClick={doAction} disabled={busy}
                className={`flex-1 font-bold py-2.5 rounded-lg disabled:opacity-40 ${modal === 'deposit' ? 'bg-gold-500 text-navy-950 hover:bg-gold-400' : 'bg-red-500/80 text-white hover:bg-red-500'}`}>
                {busy ? 'กำลังดำเนินการ...' : modal === 'deposit' ? 'ยืนยันเติมเครดิต' : 'ยืนยันแลกเครดิต'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* overlay ฉลอง/เสียใจผลโพยล่าสุด — portal ไปที่ body เพื่ออยู่บนสุดเสมอ
          (กัน ancestor ที่มี transform/animation ทำ fixed หลุดจาก viewport) */}
      {celebration && createPortal(
        <div className="fixed inset-0 z-[9999] overflow-y-auto bg-black/75">
          {celebration.kind === 'win' ? (
            <>
              {Array.from({ length: 40 }).map((_, i) => (
                <span key={i} className="confetti-piece"
                  style={{
                    left: `${(i * 37) % 100}%`,
                    background: ['#d4af37', '#22c55e', '#f472b6', '#60a5fa', '#fbbf24', '#a78bfa'][i % 6],
                    animationDuration: `${2.2 + (i % 5) * 0.5}s`,
                    animationDelay: `${(i % 10) * 0.18}s`,
                    borderRadius: i % 3 === 0 ? '50%' : '2px',
                  }} />
              ))}
            </>
          ) : (
            <>
              {Array.from({ length: 30 }).map((_, i) => (
                <span key={i} className="tear-drop"
                  style={{
                    left: `${(i * 41) % 100}%`,
                    animationDuration: `${1.8 + (i % 4) * 0.4}s`,
                    animationDelay: `${(i % 8) * 0.22}s`,
                  }} />
              ))}
            </>
          )}
          <div className="min-h-full flex">
          <div className={`relative m-auto bg-navy-800 border rounded-3xl p-6 sm:p-8 max-w-sm w-full max-h-[92dvh] overflow-y-auto text-center animate-result-pop ${celebration.kind === 'win' ? 'border-gold-500/60 animate-win' : 'border-blue-500/40'}`}>
            {celebration.kind === 'win' ? (
              <>
                <div className="text-6xl animate-coin mb-2">🎉🏆</div>
                <h2 className="text-2xl font-bold text-gold-300 mb-1">ยินดีด้วย!</h2>
                <p className="text-sm text-navy-300 mb-3">โพย <span className="font-mono text-gold-300">{celebration.slip.slip_ref}</span> ถูกรางวัล</p>
                <div className="text-3xl font-bold text-green-400 animate-coin mb-1">+{satang(celebration.slip.total_payout)} บาท</div>
                <p className="text-xs text-navy-400 mb-5">เงินรางวัลเข้ากระเป๋าเครดิตแล้ว — แลกได้หลังปลดล็อก</p>
              </>
            ) : (
              <>
                <div className="text-6xl mb-2 animate-lose">😢💧</div>
                <h2 className="text-2xl font-bold text-blue-300 mb-1">เสียใจด้วย...</h2>
                <p className="text-sm text-navy-300 mb-3">โพย <span className="font-mono text-gold-300">{celebration.slip.slip_ref}</span> ไม่ถูกรางวัลรอบนี้</p>
                <div className="text-xl font-bold text-red-400 mb-1">เสีย {satang(celebration.slip.total_stake)} บาท</div>
                <p className="text-xs text-navy-400 mb-5">เก็บเครดิตไว้ลองใหม่นะ — ห้องยังเปิดรับแทงทุกวัน</p>
              </>
            )}
            <button onClick={() => setCelebration(null)}
              className={`w-full font-bold py-3 rounded-xl ${celebration.kind === 'win' ? 'bg-gold-500 text-navy-950 hover:bg-gold-400' : 'bg-blue-600 text-white hover:bg-blue-500'}`}>
              {celebration.kind === 'win' ? 'รับทราบ ขอบคุณ! 🎊' : 'เป็นกำลังใจให้นะ 💙'}
              </button>
          </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
