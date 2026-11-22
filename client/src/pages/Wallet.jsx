import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { api, satang, bahtToSatang, fmtDateTime } from '../api.js';
import { useAuth } from '../auth.jsx';
import { sfx } from '../sound.js';
import EmptyState from '../components/EmptyState.jsx';
import { Card, CardHeader, StatCard, Modal, Button } from '../components/ui/index.js';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/shadcn/table.jsx';
const TYPE_TH = {
  initial_credit: 'เครดิตฟรี', admin_adjust: 'ปรับเครดิต(+)', admin_debit: 'ปรับเครดิต(-)',
  bet_debit: 'หักเครดิตแทง', bet_refund: 'คืนเครดิต', win_credit: 'เงินรางวัล',
  deposit: 'เติมเครดิต', withdraw: 'แลกเครดิต',
};

const PRESETS = [100, 500, 1000, 5000, 10000];

export default function Wallet() {
  const { balance, setBalance, user } = useAuth();
  const [txs, setTxs] = useState([]);
  const [wd, setWd] = useState(null); // { deposited, won, withdrawn, withdrawable, unlocked }
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // 'deposit' | 'withdraw' | null
  const [accountNo, setAccountNo] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [celebration, setCelebration] = useState(null); // { kind:'win'|'lose', slip }
  const idemRef = useRef({ sig: '', key: '' }); // idempotency key ต่อ (ประเภท+จำนวน) กันกดซ้ำ/หลุดแล้วเติม-ถอนซ้ำ

  const [params, setParams] = useSearchParams();
  const [payReqs, setPayReqs] = useState([]);
  const [payConfigured, setPayConfigured] = useState(null); // null=loading, true=real payments, false=demo mode
  const [depStep, setDepStep] = useState('form'); // 'form' | 'qr'
  const [depInfo, setDepInfo] = useState(null); // {id, reference, qrDataUrl, amount}
  const [slipFile, setSlipFile] = useState(null);
  const [bankName, setBankName] = useState('');
  const [bankAccName, setBankAccName] = useState('');

  const BANKS = ['กสิกรไทย','กรุงเทพ','กรุงไทย','กรุงศรีอยุธยา','ไทยพาณิชย์','ออมสิน','ทหารไทย','แลนด์ แอนด์ เฮ้าส์','เกียรตินาคินภัทร','ซีไอเอ็มบี','ยูโอบี','พร้อมเพย์'];

  const loadPays = () => api('/payments').then(r => { setPayReqs(r.requests || []); setPayConfigured(!!r.paymentsConfigured); }).catch(() => setPayConfigured(false));
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
    loadPays();
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

  const fileToB64 = (f) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(f);
  });

  const doAction = async () => {
    setErr('');
    const satangAmt = bahtToSatang(amount);
    if (!satangAmt || satangAmt < 100) return setErr('กรุณากรอกจำนวนเงินอย่างน้อย 1 บาท');
    if (satangAmt > 100000000) return setErr('สูงสุด 1,000,000 บาทต่อรายการ');
    setBusy(true);
    try {
      // DEMO MODE — ระบบเงินจริงยังไม่ตั้งค่า (ไม่มี PROMPTPAY_ID) → ใช้ flow เดิม
      if (payConfigured === false) {
        const sig = `${modal}:${satangAmt}`;
        if (idemRef.current.sig !== sig) idemRef.current = { sig, key: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`) };
        const r = await api('/bets/wallet/action', { method: 'POST', body: { direction: modal, amount: satangAmt, paymentMethod: 'bank_transfer', idempotencyKey: idemRef.current.key, ...(accountNo ? { accountNo } : {}) } });
        setBalance(r.balance);
        setModal(null); setAmount(''); idemRef.current = { sig: '', key: '' };
        load();
        return;
      }
      if (modal === 'deposit' && depStep === 'form') {
        // สร้างคำขอเติม → แสดง QR พร้อมเพย์จริง
        const r = await api('/payments/deposit', { method: 'POST', body: { amount: satangAmt, method: 'promptpay' } });
        setDepInfo({ id: r.id, reference: r.reference, qrDataUrl: r.qrDataUrl, amount: r.amount });
        setDepStep('qr');
        return;
      }
      if (modal === 'deposit' && depStep === 'qr') {
        if (!slipFile) return setErr('กรุณาแนบรูปสลิปการโอนเงินก่อน');
        const imageBase64 = await fileToB64(slipFile);
        const r = await api(`/payments/${depInfo.id}/slip`, { method: 'POST', body: { imageBase64 } });
        setModal(null); setAmount(''); setDepStep('form'); setDepInfo(null); setSlipFile(null); idemRef.current = { sig: '', key: '' };
        load(); loadPays();
        if (r.credited) { setBalance(r.balance); alert(`✅ เติมเครดิตสำเร็จ +฿${(depInfo.amount / 100).toLocaleString('th-TH')} — สลิปผ่านการตรวจสอบอัตโนมัติ`); }
        else alert(`📨 ส่งสลิปแล้ว — รอแอดมินตรวจสอบ\n${r.reason || ''}`);
        return;
      }
      if (modal === 'withdraw') {
        if (!bankName || !bankAccName || !accountNo) return setErr('กรุณากรอกข้อมูลบัญชีธนาคารให้ครบ (ธนาคาร/เลขบัญชี/ชื่อบัญชี)');
        if (wd && !wd.unlocked) return setErr('ต้องเติมเครดิตขั้นต่ำ 100 บาท ก่อนจึงจะสามารถถอนเงินได้');
        if (wd && satangAmt > wd.withdrawable) return setErr(`ถอนได้สูงสุด ${satang(wd.withdrawable)} บาท (เฉพาะเงินรางวัล)`);
        const r = await api('/payments/withdraw', { method: 'POST', body: { amount: satangAmt, bankName, accountNo, accountName: bankAccName } });
        setModal(null); setAmount(''); setBankName(''); setBankAccName(''); setAccountNo('');
        load(); loadPays();
        alert(`📨 ส่งคำขอถอน ฿${(r.amount / 100).toLocaleString('th-TH')} แล้ว — รอแอดมินอนุมัติ`);
        return;
      }
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
      {/* HERO BALANCE CARD — NEW DESIGN - RED BACKGROUND FOR VISIBILITY */}
      <Card className="bg-gradient-to-br from-red-600 to-red-800 border-2 border-red-400 overflow-hidden">
        {/* member strip — subtitle */}
        <div className="flex items-center gap-2 px-5 pt-5 pb-3">
          <span className="w-8 h-8 rounded-full bg-white text-red-600 font-black text-sm flex items-center justify-center border-2 border-white shrink-0">
            {(user?.displayName || user?.username || 'ล').slice(0, 1).toUpperCase()}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white truncate">{user?.displayName || user?.username || 'สมาชิก'}</div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white text-red-600">MEMBER</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-yellow-400 text-black">DEMO</span>
            </div>
          </div>
        </div>
        
        {/* large balance display */}
        <div className="px-5 pb-4">
          <div className="text-[10px] font-bold text-white/80 uppercase tracking-wider mb-1">ยอดคงเหลือ</div>
          <div className="text-5xl sm:text-6xl font-black text-white leading-none">{satang(balance)}</div>
          <div className="text-sm font-bold text-white/80 mt-0.5">บาท</div>
        </div>

        {/* full-width action buttons */}
        <div className="px-5 pb-3 space-y-2">
          <button onClick={() => { setModal('deposit'); setAmount(''); setErr(''); setDepStep('form'); setDepInfo(null); setSlipFile(null); }}
            className="w-full rounded-xl bg-white text-red-600 font-black py-4 text-sm tracking-wide shadow-lg hover:bg-gray-100 active:scale-[0.98] transition">
            ＋ ฝากเงิน
          </button>
          <button onClick={() => { setModal('withdraw'); setAmount(''); setErr(''); setDepStep('form'); setDepInfo(null); setSlipFile(null); }}
            className="w-full rounded-xl bg-yellow-400 text-black font-black py-4 text-sm tracking-wide shadow-lg hover:bg-yellow-300 active:scale-[0.98] transition">
            🏦 ถอนเงิน
          </button>
        </div>

        {/* withdrawable status */}
        {wd && (
          <div className={`mx-5 mb-4 rounded-lg px-3 py-2 text-xs font-semibold text-center ${wd.pendingSlips > 0 ? 'bg-yellow-300 text-black' : wd.unlocked ? 'bg-green-300 text-black' : 'bg-yellow-300 text-black'}`}>
            {wd.pendingSlips > 0 && (
              <div className="mb-0.5">⏳ มีโพย {wd.pendingSlips} รายการค้างผล ({satang(wd.pendingStake)} บาท)</div>
            )}
            {wd.unlocked
              ? wd.override
                ? balance < 5000
                  ? `✅ ได้รับอนุญาตให้ถอนจากแอดมิน — แต่ยอดคงเหลือ ${satang(balance)} บาท ต่ำกว่า 50 บาท ถอนไม่ได้`
                  : `✅ ถอนได้ ${satang(wd.withdrawable)} บาท (ยอดสุทธิหักเครดิตแถม)`
                : `✅ ถอนได้ ${satang(wd.withdrawable)} บาท (ยอดคงเหลือหักเครดิตแถม)`
              : `🔒 ถอนได้หลังมียอดฝาก/เล่นถึงเกณฑ์ — ฝากแล้ว ${satang(wd.deposited)} บาท`}
          </div>
        )}
        
        <div className="px-5 pb-5 text-center">
          <div className="text-[10px] text-white/80 font-semibold">เครดิตเสมือนสำหรับการศึกษา — โปรโมชันถอนไม่ได้ เฉพาะเงินฝาก/เงินรางวัล</div>
        </div>
      </Card>

      {/* สรุปยอดเดิมพัน/รางวัล */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="แทงวันนี้" value={`${satang(sumToday.stake)} ฿`} accent="text-lose-300" />
        <StatCard label="รางวัลวันนี้" value={`${satang(sumToday.win)} ฿`} accent="text-win-300" />
        <StatCard label="แทง 7 วัน" value={`${satang(sumWeek.stake)} ฿`} accent="text-lose-300" />
        <StatCard label="รางวัล 7 วัน" value={`${satang(sumWeek.win)} ฿`} accent="text-win-300" />
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="ประวัติธุรกรรมเครดิต" />
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
          {!loading && !txs.length && <div className="p-4"><EmptyState emoji="💳" title="ยังไม่มีธุรกรรม" hint="เติมเครดิตเพื่อเริ่มใช้งาน — ฝาก/ถอนเป็นเครดิตเสมือน" /></div>}
          {loading && <div className="p-4 space-y-2">{[0,1,2,3].map(i => <div key={i} className="skeleton h-14 w-full" />)}</div>}
        </div>
        {/* Desktop: ตารางเต็ม */}
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow className="border-navy-700/60 hover:bg-transparent">
                <TableHead className="text-navy-400">อ้างอิง</TableHead>
                <TableHead className="text-navy-400">ประเภท</TableHead>
                <TableHead className="text-navy-400 text-right">จำนวน</TableHead>
                <TableHead className="text-navy-400 text-right">คงเหลือหลังรายการ</TableHead>
                <TableHead className="text-navy-400">เวลา</TableHead>
                <TableHead className="text-navy-400">รายละเอียด</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txs.map(t => (
                <TableRow key={t.id} className="border-navy-700/50">
                  <TableCell className="font-mono text-xs text-navy-300">{t.reference}</TableCell>
                  <TableCell className="text-white">{TYPE_TH[t.type] || t.type}</TableCell>
                  <TableCell className={`text-right font-bold ${t.direction === 'credit' ? 'text-green-400' : 'text-red-400'}`}>
                    {t.direction === 'credit' ? '+' : '−'}{satang(t.amount)} บาท
                  </TableCell>
                  <TableCell className="text-right text-gold-300">{satang(t.balance_after)} บาท</TableCell>
                  <TableCell className="text-xs text-navy-300 whitespace-nowrap">{fmtDateTime(t.created_at)}</TableCell>
                  <TableCell className="text-xs text-navy-300 max-w-[200px] truncate">{t.description || '—'}</TableCell>
                </TableRow>
              ))}
              {!loading && !txs.length && <TableRow><TableCell colSpan="6"><EmptyState emoji="💳" title="ยังไม่มีธุรกรรม" hint="เติมเครดิตเพื่อเริ่มใช้งาน" /></TableCell></TableRow>}
              {loading && <TableRow><TableCell colSpan="6"><div className="space-y-2 py-2">{[0,1,2,3].map(i => <div key={i} className="skeleton h-8 w-full" />)}</div></TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* modal เติม/ถอนเงินจริง — PromptPay QR + สลิป / ถอนรออนุมัติ */}
      <Modal open={!!modal} onClose={() => !busy && setModal(null)}
        title={modal === 'deposit' ? (depStep === 'qr' ? 'สแกน QR พร้อมเพย์' : 'เติมเครดิต') : 'ถอนเครดิต'}>
            <p className="text-xs text-navy-400 mb-4 -mt-1">ยอดคงเหลือปัจจุบัน {satang(balance)} บาท{payConfigured === false ? ' • โหมด DEMO (เครดิตจำลอง)' : ''}</p>
            {payConfigured === false && (
              <div className="text-[11px] bg-amber-500/10 text-amber-300 rounded-lg px-3 py-2 mb-3">
                ⚠️ ระบบเติม/ถอนเงินจริงยังไม่เปิด — ใช้เครดิตเดโมสำหรับทดสอบเท่านั้น
              </div>
            )}
            {modal === 'withdraw' && wd && (
              <div className={`text-xs rounded-lg px-3 py-2 mb-3 ${wd.unlocked ? 'bg-green-500/10 text-green-300' : 'bg-amber-500/10 text-amber-300'}`}>
                {wd.unlocked
                  ? `ถอนได้ ${satang(wd.withdrawable)} บาท (เฉพาะเงินรางวัล/ยอดสุทธิ — เครดิตโปรโมชั่นถอนไม่ได้)`
                  : `ยังถอนไม่ได้ — ต้องมียอดฝาก/เล่นจนถอนได้ขั้นต่ำ (ฝากแล้ว ${satang(wd.deposited)} บาท)`}
              </div>
            )}
            {modal === 'deposit' && depStep === 'qr' && depInfo ? (
              <div className="space-y-4">
                <div className="bg-navy-900/60 border border-navy-700 rounded-lg p-4 text-center">
                  <img src={depInfo.qrDataUrl} alt="QR พร้อมเพย์" className="mx-auto rounded-lg bg-white p-2" />
                  <div className="text-gold-300 font-bold text-xl mt-2">฿{(depInfo.amount / 100).toLocaleString('th-TH')}</div>
                  <div className="text-xs text-navy-400 mt-1">สแกนด้วยแอปธนาคาร → โอนยอด <b className="text-white">ตรงตามจำนวน</b></div>
                  <div className="text-[11px] text-navy-400 mt-1">Ref: <span className="font-mono text-gold-300">{depInfo.reference}</span></div>
                </div>
                <div>
                  <div className="text-xs text-navy-400 mb-1.5">แนบรูปสลิปการโอน (JPG/PNG):</div>
                  <input type="file" accept="image/*" capture="environment"
                    onChange={e => setSlipFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-navy-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gold-500 file:text-navy-950 file:font-bold file:cursor-pointer" />
                  {slipFile && <div className="text-xs text-green-400 mt-1">✓ {slipFile.name}</div>}
                  <div className="text-[11px] text-navy-400 mt-2">ระบบจะตรวจสอบสลิปอัตโนมัติ — ถ้าผ่าน เครดิตเข้าทันที ไม่ผ่านแอดมินจะตรวจสอบให้</div>
                </div>
              </div>
            ) : modal === 'deposit' ? (
              <div className="mb-3">
                {payConfigured === false ? (
                  <div className="bg-navy-900/60 border border-navy-700 rounded-lg p-3 text-xs text-navy-300">
                    <div className="text-white font-semibold mb-1">เติมเครดิตเดโม</div>
                    <div className="text-navy-400">กดยืนยันแล้วเครดิตเข้าทันที — ไม่เกี่ยวกับเงินจริง</div>
                  </div>
                ) : (
                <>
                <div className="text-xs text-navy-400 mb-1.5">ช่องทาง: สแกน QR พร้อมเพย์ (แสดง QR หลังเลือกจำนวน)</div>
                <div className="bg-navy-900/60 border border-navy-700 rounded-lg p-3 text-xs text-navy-300">
                  <div className="flex justify-between"><span>ช่องทาง</span><span className="text-white font-semibold">QR พร้อมเพย์</span></div>
                  <div className="text-navy-400 mt-1">โอนเงิน → ได้ QR → สแกนจ่าย → แนบสลิป → เครดิตเข้าทันที</div>
                </div>
                </>
                )}
              </div>
            ) : payConfigured === false ? (
              <div className="mb-3">
                <div className="text-xs text-navy-400 mb-1.5">(เดโม) กรอกปลายทางรับเครดิตถ้าต้องการ:</div>
                <input value={accountNo} onChange={e => setAccountNo(e.target.value)}
                  placeholder="เลขบัญชี/เบอร์ (ไม่บังคับ)"
                  className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold-500" />
              </div>
            ) : (
              <div className="mb-3 space-y-2">
                <div className="text-xs text-navy-400">ข้อมูลบัญชีรับเงิน (แอดมินจะโอนให้):</div>
                <select value={bankName} onChange={e => setBankName(e.target.value)}
                  className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 text-sm text-white">
                  <option value="">— เลือกธนาคาร —</option>
                  {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                <input value={accountNo} onChange={e => setAccountNo(e.target.value.replace(/[^\d-]/g, ''))}
                  placeholder="เลขบัญชี" inputMode="numeric"
                  className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold-500" />
                <input value={bankAccName} onChange={e => setBankAccName(e.target.value)}
                  placeholder="ชื่อบัญชี (ตามบัญชีธนาคาร)"
                  className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold-500" />
                <div className="text-[11px] text-navy-400">⚠️ คำขอถอนจะรอแอดมินตรวจสอบและโอนเงินจริงให้ — ระยะเวลา 1-3 วันทำการ</div>
              </div>
            )}
            {modal && depStep === 'form' && (
              <>
                <div className="text-xs text-navy-400 mb-1.5">เลือกจำนวนเงินที่ต้องการ{modal === 'deposit' ? 'เติม' : 'ถอน'} (ขั้นต่ำ 100 บาท):</div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {PRESETS.map(p => (
                    <button key={p} type="button" onClick={() => setAmount(String(p))}
                      className={`py-2.5 rounded-lg text-sm font-bold border transition ${Number(amount) === p ? 'bg-gold-500 text-navy-950 border-gold-400' : 'bg-navy-700 border-navy-600 text-navy-200 hover:border-gold-500/60 hover:text-gold-300'}`}>
                      {p.toLocaleString()} บาท
                    </button>
                  ))}
                </div>
                <div className="text-xs text-navy-400 mb-1.5">หรือกรอกจำนวนเอง:</div>
                <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                  inputMode="decimal" placeholder="0.00"
                  className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 text-xl text-center text-gold-300 focus:outline-none focus:border-gold-500" />
              </>
            )}
            {err && <div className="text-red-400 text-sm mt-2">{err}</div>}
            <div className="flex gap-3 mt-5">
              {modal === 'deposit' && depStep === 'qr' ? (
                <Button variant="ghost" onClick={() => { setDepStep('form'); setDepInfo(null); setSlipFile(null); setErr(''); }} disabled={busy} className="flex-1">
                  ← ย้อนกลับ
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setModal(null)} disabled={busy} className="flex-1">
                  ยกเลิก
                </Button>
              )}
              <Button onClick={doAction} disabled={busy}
                variant={modal === 'deposit' ? 'primary' : 'danger'} className="flex-1">
                {busy ? 'กำลังดำเนินการ...' : modal === 'deposit'
                  ? (depStep === 'qr' ? 'ส่งสลิปยืนยัน' : 'สร้าง QR พร้อมเพย์')
                  : 'ส่งคำขอถอน'}
              </Button>
            </div>
      </Modal>

      {/* ประวัติคำขอชำระเงิน */}
      {payReqs.length > 0 && (
        <Card className="mt-4">
          <CardHeader title="คำขอเติม/ถอนเงิน" />
          <div className="divide-y divide-navy-700/50">
            {payReqs.slice(0, 10).map(p => (
              <div key={p.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="font-semibold text-white">
                    {p.kind === 'deposit' ? '💳 เติม' : '🏦 ถอน'} ฿{satang(p.amount)}
                    <span className="ml-2 text-[11px] font-mono text-navy-400">{p.reference}</span>
                  </div>
                  <div className="text-[11px] text-navy-400 truncate">
                    {fmtDateTime(p.created_at)}
                    {p.slip_trans_ref ? ` • สลิป ${p.slip_trans_ref}` : ''}
                    {p.bank_name ? ` • ${p.bank_name} ${p.bank_account_no}` : ''}
                    {p.slip_error ? ` • ⚠️ ${p.slip_error}` : ''}
                    {p.admin_note ? ` • หมายเหตุ: ${p.admin_note}` : ''}
                  </div>
                </div>
                <span className={`shrink-0 text-[11px] font-bold px-2 py-1 rounded ${
                  p.status === 'approved' ? 'bg-green-500/15 text-green-300'
                  : p.status === 'rejected' ? 'bg-red-500/15 text-red-300'
                  : 'bg-amber-500/15 text-amber-300'}`}>
                  {p.status === 'approved' ? '✅ สำเร็จ' : p.status === 'rejected' ? '❌ ปฏิเสธ' : p.status === 'pending_slip' ? '📤 รอสลิป' : '⏳ รอตรวจสอบ'}
                </span>
              </div>
            ))}
          </div>
        </Card>
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
          <div className={`relative m-auto bg-navy-800 border rounded-3xl p-6 sm:p-8 max-w-sm w-full max-h-[92dvh] overflow-y-auto text-center animate-result-pop ${celebration.kind === 'win' ? 'border-gold-500/60' : 'border-blue-500/40'}`}>
            {celebration.kind === 'win' ? (
              <>
                <div className="text-6xl mb-2">🎉🏆</div>
                <h2 className="text-2xl font-bold text-gold-300 mb-1">ยินดีด้วย!</h2>
                <p className="text-sm text-navy-300 mb-3">โพย <span className="font-mono text-gold-300">{celebration.slip.slip_ref}</span> ถูกรางวัล</p>
                <div className="text-3xl font-bold text-green-400 mb-1">+{satang(celebration.slip.total_payout)} บาท</div>
                <p className="text-xs text-navy-400 mb-5">เงินรางวัลเข้ากระเป๋าเครดิตแล้ว — แลกได้หลังปลดล็อก</p>
              </>
            ) : (
              <>
                <div className="text-6xl mb-2">😢💧</div>
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
