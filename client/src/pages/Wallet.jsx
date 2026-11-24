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
  const [ppId, setPpId] = useState('');
  const [txTotal, setTxTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const TX_PAGE = 20;

  const BANKS = ['กสิกรไทย','กรุงเทพ','กรุงไทย','กรุงศรีอยุธยา','ไทยพาณิชย์','ออมสิน','ทหารไทย','แลนด์ แอนด์ เฮ้าส์','เกียรตินาคินภัทร','ซีไอเอ็มบี','ยูโอบี','พร้อมเพย์'];

  const [payTotal, setPayTotal] = useState(0);
  const [loadingMorePays, setLoadingMorePays] = useState(false);
  const PAY_PAGE = 30;
  const loadPays = (offset = 0) => api(`/payments?limit=${PAY_PAGE}&offset=${offset}`).then(r => {
      setPayReqs(prev => offset === 0 ? (r.requests || []) : [...prev, ...(r.requests || [])]);
      setPayTotal(r.total ?? (r.requests || []).length);
      setPayConfigured(!!r.paymentsConfigured);
    }).catch(() => setPayConfigured(false));
  const loadMorePays = () => { setLoadingMorePays(true); loadPays(payReqs.length).finally(() => setLoadingMorePays(false)); };
  const load = () => api(`/bets/wallet?limit=${TX_PAGE}&offset=0`).then(r => {
      setTxs(r.transactions); setTxTotal(r.total ?? r.transactions.length);
      setBalance(r.balance); setWd(r.withdrawable || null);
    })
    .catch(() => {}).finally(() => setLoading(false));
  const loadMoreTxs = () => {
    setLoadingMore(true);
    api(`/bets/wallet?limit=${TX_PAGE}&offset=${txs.length}`)
      .then(r => { setTxs(prev => [...prev, ...(r.transactions || [])]); setTxTotal(r.total ?? txs.length); })
      .catch(() => {}).finally(() => setLoadingMore(false));
  };
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

  // แปลงรูปสลิปเป็น base64 — ย่อขนาดอัตโนมัติ (max 1600px, JPEG 0.82)
  // รูปจากมือถือมัก 3-8MB → base64 เกิน limit 7MB ของ API → บีบอัดก่อนส่ง
  const fileToB64 = (f) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1600;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        res(cv.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => res(String(r.result)); // ถ้า decode ไม่ได้ ส่งต้นฉบับ
      img.src = String(r.result);
    };
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
      if ((modal === 'deposit' && (depStep === 'qr' || depStep === 'slip'))) {
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
        const r = await api('/payments/withdraw', { method: 'POST', body: { amount: satangAmt, bankName, accountNo, accountName: bankAccName, promptpayId: ppId || undefined } });
        setModal(null); setAmount(''); setBankName(''); setBankAccName(''); setAccountNo(''); setPpId('');
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

  const [depositHover, setDepositHover] = useState(false);
  const [withdrawHover, setWithdrawHover] = useState(false);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* HERO BALANCE CARD — Luxury Gold style */}
      <Card className="overflow-hidden" style={{ background: 'linear-gradient(135deg, var(--bg-card), var(--bg-dark-surface))', border: '1px solid var(--border-gold)', borderRadius: 'var(--radius-2xl)' }}>
        {/* member strip — subtitle */}
        <div className="flex items-center gap-2 px-5 pt-5 pb-3">
          <span style={{ width: '3rem', height: '3rem', borderRadius: '50%', background: 'rgba(212, 175, 55, 0.2)', color: 'var(--gold-bright)', fontWeight: 900, fontSize: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-gold)', flexShrink: 0 }}>
            {(user?.displayName || user?.username || 'ล').slice(0, 1).toUpperCase()}
          </span>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--white)' }}>{user?.displayName || user?.username || 'สมาชิก'}</div>
            <div className="flex items-center gap-1.5">
              <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '0.125rem 0.375rem', borderRadius: '0.25rem', background: 'var(--bg-dark-surface)', color: 'var(--muted-gray)', border: '1px solid var(--border-light)' }}>MEMBER</span>
              <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '0.125rem 0.375rem', borderRadius: '0.25rem', background: 'rgba(245, 158, 11, 0.9)', color: 'var(--white)' }}>DEMO</span>
            </div>
          </div>
        </div>

        {/* large balance display */}
        <div className="px-5 pb-4">
          <div style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--muted-gray)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>ยอดคงเหลือ</div>
          <div style={{ fontSize: '2.5rem', lineHeight: 1, fontWeight: 900, background: 'linear-gradient(135deg, var(--gold-primary), var(--gold-bright))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{satang(balance)}</div>
          <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--muted-gray)', marginTop: '0.125rem' }}>บาท</div>
        </div>

        {/* full-width action buttons */}
        <div className="px-5 pb-3 space-y-2">
          <button
            onClick={() => { setModal('deposit'); setAmount(''); setErr(''); setDepStep('form'); setDepInfo(null); setSlipFile(null); }}
            onMouseEnter={() => setDepositHover(true)}
            onMouseLeave={() => setDepositHover(false)}
            style={{
              width: '100%',
              borderRadius: 'var(--radius-lg)',
              background: 'linear-gradient(135deg, var(--gold-gradient-start), var(--gold-gradient-end))',
              color: 'var(--bg-deep-black)',
              fontWeight: 900,
              padding: '0.75rem',
              fontSize: '0.875rem',
              letterSpacing: '0.05em',
              border: 'none',
              cursor: 'pointer',
              boxShadow: depositHover ? 'var(--shadow-gold-lg)' : 'var(--shadow-gold)',
              transform: depositHover ? 'translateY(-1px)' : 'translateY(0)',
              transition: 'all 0.2s ease-in-out'
            }}
          >
            ＋ ฝากเงิน
          </button>
          <button
            onClick={() => { setModal('withdraw'); setAmount(''); setErr(''); setDepStep('form'); setDepInfo(null); setSlipFile(null); setPpId(''); }}
            onMouseEnter={() => setWithdrawHover(true)}
            onMouseLeave={() => setWithdrawHover(false)}
            style={{
              width: '100%',
              borderRadius: 'var(--radius-lg)',
              background: 'transparent',
              color: 'var(--gold-primary)',
              fontWeight: 900,
              padding: '0.75rem',
              fontSize: '0.875rem',
              letterSpacing: '0.05em',
              border: '1px solid var(--gold-primary)',
              cursor: 'pointer',
              boxShadow: 'none',
              transform: withdrawHover ? 'translateY(-1px)' : 'translateY(0)',
              transition: 'all 0.2s ease-in-out'
            }}
          >
            🏦 ถอนเงิน
          </button>
        </div>

        {/* withdrawable status */}
        {wd && (
          <div style={{
            margin: '0 1.25rem 1rem',
            borderRadius: 'var(--radius-md)',
            padding: '0.5rem 0.75rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            textAlign: 'center',
            background: wd.pendingSlips > 0 ? 'rgba(245, 158, 11, 0.1)' : wd.unlocked ? 'rgba(34, 197, 94, 0.1)' : 'rgba(245, 158, 11, 0.1)',
            color: wd.pendingSlips > 0 ? 'var(--warning-amber)' : wd.unlocked ? 'var(--success-green)' : 'var(--warning-amber)',
            border: wd.pendingSlips > 0 ? '1px solid rgba(245, 158, 11, 0.3)' : wd.unlocked ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)'
          }}>
            {wd.pendingSlips > 0 && (
              <div style={{ marginBottom: '0.125rem' }}>⏳ มีโพย {wd.pendingSlips} รายการค้างผล ({satang(wd.pendingStake)} บาท)</div>
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
          <div style={{ fontSize: '0.625rem', color: 'var(--muted-gray)', fontWeight: 600 }}>เครดิตเสมือนสำหรับการศึกษา — โปรโมชันถอนไม่ได้ เฉพาะเงินฝาก/เงินรางวัล</div>
        </div>
      </Card>

      {/* ประวัติคำขอชำระเงิน — ไว้ด้านบนสุด แสดง 30 รายการ ที่เหลือซ่อนไว้ */}
      {payReqs.length > 0 && (
        <Card style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-xl)' }}>
          <CardHeader title={`คำขอเติม/ถอนเงิน (${payReqs.length})`} />
          <div style={{ borderBottom: '1px solid var(--border-light)' }}>
            {payReqs.map(p => (
              <div key={p.id} style={{ padding: '0.625rem 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.875rem', borderBottom: '1px solid var(--border-light)' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--white)' }}>
                    {p.kind === 'deposit' ? '💳 เติม' : '🏦 ถอน'} ฿{satang(p.amount)}
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.6875rem', fontFamily: 'monospace', color: 'var(--muted-gray)' }}>{p.reference}</span>
                  </div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--muted-gray)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {fmtDateTime(p.created_at)}
                    {p.slip_trans_ref ? ` • สลิป ${p.slip_trans_ref}` : ''}
                    {p.bank_name ? ` • ${p.bank_name} ${p.bank_account_no}` : ''}
                    {p.slip_error ? ` • ⚠️ ${p.slip_error}` : ''}
                    {p.admin_note ? ` • หมายเหตุ: ${p.admin_note}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem', flexShrink: 0 }}>
                  <span style={{
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    padding: '0.25rem 0.5rem',
                    borderRadius: '0.25rem',
                    background: p.status === 'approved' ? 'rgba(34, 197, 94, 0.15)' : p.status === 'rejected' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                    color: p.status === 'approved' ? 'var(--success-green)' : p.status === 'rejected' ? 'var(--danger-red)' : 'var(--warning-amber)'
                  }}>
                    {p.status === 'approved' ? '✅ สำเร็จ' : p.status === 'rejected' ? '❌ ปฏิเสธ' : p.status === 'pending_slip' ? '📤 รอสลิป' : '⏳ รอตรวจสอบ'}
                  </span>
                  {p.status === 'pending_slip' && p.kind === 'deposit' && (
                    <button onClick={() => {
                      setDepInfo({ id: p.id, reference: p.reference, amount: p.amount });
                      setDepStep('slip'); setSlipFile(null); setErr(''); setModal('deposit');
                    }}
                      style={{ fontSize: '0.6875rem', fontWeight: 700, padding: '0.25rem 0.625rem', borderRadius: '0.25rem', background: 'rgba(212, 175, 55, 0.15)', color: 'var(--gold-primary)', border: 'none', cursor: 'pointer' }}>
                      📎 แนบสลิป
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {payReqs.length < payTotal && (
            <button onClick={loadMorePays} disabled={loadingMorePays}
              style={{ width: '100%', padding: '0.625rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--gold-primary)', border: 'none', borderTop: '1px solid var(--border-light)', background: 'transparent', cursor: loadingMorePays ? 'not-allowed' : 'pointer', opacity: loadingMorePays ? 0.5 : 1 }}>
              {loadingMorePays ? 'กำลังโหลด...' : `▼ โหลดเพิ่มเติม (แสดง ${payReqs.length}/${payTotal})`}
            </button>
          )}
        </Card>
      )}

      {/* สรุปยอดเดิมพัน/รางวัล */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="แทงวันนี้" value={`${satang(sumToday.stake)} ฿`} accent="text-lose-300" />
        <StatCard label="รางวัลวันนี้" value={`${satang(sumToday.win)} ฿`} accent="text-win-300" />
        <StatCard label="แทง 7 วัน" value={`${satang(sumWeek.stake)} ฿`} accent="text-lose-300" />
        <StatCard label="รางวัล 7 วัน" value={`${satang(sumWeek.win)} ฿`} accent="text-win-300" />
      </div>

      <Card className="overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-xl)' }}>
        <CardHeader title="ประวัติธุรกรรมเครดิต" />
        {/* มือถือ/แท็บเล็ต: การ์ดเรียงแนวตั้ง ไม่ล้นจอ */}
        <div className="md:hidden" style={{ borderBottom: '1px solid var(--border-light)' }}>
          {txs.map(t => (
            <div key={t.id} style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.875rem', color: 'var(--white)', fontWeight: 600 }}>{TYPE_TH[t.type] || t.type}</div>
                  <div style={{ fontSize: '0.6875rem', fontFamily: 'monospace', color: 'var(--muted-gray)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.reference}</div>
                  {t.description && <div style={{ fontSize: '0.6875rem', color: 'var(--muted-gray)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '0.125rem' }}>{t.description}</div>}
                  <div style={{ fontSize: '0.6875rem', color: 'var(--muted-gray)', marginTop: '0.125rem' }}>{fmtDateTime(t.created_at)}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, color: t.direction === 'credit' ? 'var(--success-green)' : 'var(--danger-red)' }}>
                    {t.direction === 'credit' ? '+' : '−'}{satang(t.amount)} บาท
                  </div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--gold-primary)' }}>คงเหลือ {satang(t.balance_after)} บาท</div>
                </div>
              </div>
            </div>
          ))}
          {!loading && !txs.length && <div style={{ padding: '1rem' }}><EmptyState emoji="💳" title="ยังไม่มีธุรกรรม" hint="เติมเครดิตเพื่อเริ่มใช้งาน — ฝาก/ถอนเป็นเครดิตเสมือน" /></div>}
          {loading && <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>{[0,1,2,3].map(i => <div key={i} className="skeleton" style={{ height: '3.5rem', width: '100%' }} />)}</div>}
        </div>
        {/* Desktop: ตารางเต็ม */}
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow style={{ border: '1px solid var(--border-light)' }}>
                <TableHead style={{ color: 'var(--muted-gray)' }}>อ้างอิง</TableHead>
                <TableHead style={{ color: 'var(--muted-gray)' }}>ประเภท</TableHead>
                <TableHead style={{ color: 'var(--muted-gray)', textAlign: 'right' }}>จำนวน</TableHead>
                <TableHead style={{ color: 'var(--muted-gray)', textAlign: 'right' }}>คงเหลือหลังรายการ</TableHead>
                <TableHead style={{ color: 'var(--muted-gray)' }}>เวลา</TableHead>
                <TableHead style={{ color: 'var(--muted-gray)' }}>รายละเอียด</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txs.map(t => (
                <TableRow key={t.id} style={{ border: '1px solid var(--border-light)' }}>
                  <TableCell style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--muted-gray)' }}>{t.reference}</TableCell>
                  <TableCell style={{ color: 'var(--white)' }}>{TYPE_TH[t.type] || t.type}</TableCell>
                  <TableCell style={{ textAlign: 'right', fontWeight: 700, color: t.direction === 'credit' ? 'var(--success-green)' : 'var(--danger-red)' }}>
                    {t.direction === 'credit' ? '+' : '−'}{satang(t.amount)} บาท
                  </TableCell>
                  <TableCell style={{ textAlign: 'right', color: 'var(--gold-primary)' }}>{satang(t.balance_after)} บาท</TableCell>
                  <TableCell style={{ fontSize: '0.75rem', color: 'var(--muted-gray)', whiteSpace: 'nowrap' }}>{fmtDateTime(t.created_at)}</TableCell>
                  <TableCell style={{ fontSize: '0.75rem', color: 'var(--muted-gray)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description || '—'}</TableCell>
                </TableRow>
              ))}
              {!loading && !txs.length && <TableRow><TableCell colSpan="6"><EmptyState emoji="💳" title="ยังไม่มีธุรกรรม" hint="เติมเครดิตเพื่อเริ่มใช้งาน" /></TableCell></TableRow>}
              {loading && <TableRow><TableCell colSpan="6"><div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.5rem 0' }}>{[0,1,2,3].map(i => <div key={i} className="skeleton" style={{ height: '2rem', width: '100%' }} />)}</div></TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        {txs.length < txTotal && (
          <button onClick={loadMoreTxs} disabled={loadingMore}
            style={{ width: '100%', padding: '0.625rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--gold-primary)', border: 'none', borderTop: '1px solid var(--border-light)', background: 'transparent', cursor: loadingMore ? 'not-allowed' : 'pointer', opacity: loadingMore ? 0.5 : 1 }}>
            {loadingMore ? 'กำลังโหลด...' : `▼ โหลดเพิ่มเติม (แสดง ${txs.length}/${txTotal})`}
          </button>
        )}
      </Card>

      {/* modal เติม/ถอนเงินจริง — PromptPay QR + สลิป / ถอนรออนุมัติ */}
      <Modal open={!!modal} onClose={() => !busy && setModal(null)}
        title={modal === 'deposit' ? (depStep === 'qr' ? 'สแกน QR พร้อมเพย์' : 'เติมเครดิต') : 'ถอนเครดิต'}>
            <p style={{ fontSize: '0.75rem', color: 'var(--muted-gray)', marginBottom: '1rem', marginTop: '-0.25rem' }}>ยอดคงเหลือปัจจุบัน {satang(balance)} บาท{payConfigured === false ? ' • โหมด DEMO (เครดิตจำลอง)' : ''}</p>
            {payConfigured === false && (
              <div style={{ fontSize: '0.6875rem', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning-amber)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', marginBottom: '0.75rem' }}>
                ⚠️ ระบบเติม/ถอนเงินจริงยังไม่เปิด — ใช้เครดิตเดโมสำหรับทดสอบเท่านั้น
              </div>
            )}
            {modal === 'withdraw' && wd && (
              <div style={{ fontSize: '0.75rem', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', marginBottom: '0.75rem', background: wd.unlocked ? 'rgba(34, 197, 94, 0.1)' : 'rgba(245, 158, 11, 0.1)', color: wd.unlocked ? 'var(--success-green)' : 'var(--warning-amber)' }}>
                {wd.unlocked
                  ? `ถอนได้ ${satang(wd.withdrawable)} บาท (เฉพาะเงินรางวัล/ยอดสุทธิ — เครดิตโปรโมชั่นถอนไม่ได้)`
                  : `ยังถอนไม่ได้ — ต้องมียอดฝาก/เล่นจนถอนได้ขั้นต่ำ (ฝากแล้ว ${satang(wd.deposited)} บาท)`}
              </div>
            )}
            {modal === 'deposit' && depStep === 'slip' && depInfo ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ background: 'var(--bg-dark-surface)', border: '1px solid var(--border-light)', borderRadius: '0.5rem', padding: '0.75rem', textAlign: 'center', fontSize: '0.875rem' }}>
                  <div style={{ color: 'var(--gold-primary)', fontWeight: 700, fontSize: '1.125rem' }}>฿{(depInfo.amount / 100).toLocaleString('th-TH')}</div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--muted-gray)', marginTop: '0.25rem' }}>Ref: <span style={{ fontFamily: 'monospace', color: 'var(--gold-primary)' }}>{depInfo.reference}</span> — แนบสลิปการโอนที่ทำไปแล้ว</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted-gray)', marginBottom: '0.375rem' }}>แนบรูปสลิปการโอน (JPG/PNG):</div>
                  <input type="file" accept="image/*"
                    onChange={e => setSlipFile(e.target.files?.[0] || null)}
                    style={{ width: '100%', fontSize: '0.875rem', color: 'var(--muted-gray)' }} />
                  {slipFile && <div style={{ fontSize: '0.75rem', color: 'var(--success-green)', marginTop: '0.25rem' }}>✓ {slipFile.name}</div>}
                </div>
              </div>
            ) : modal === 'deposit' && depStep === 'qr' && depInfo ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ background: 'var(--bg-dark-surface)', border: '1px solid var(--border-light)', borderRadius: '0.5rem', padding: '1rem', textAlign: 'center' }}>
                  <img src={depInfo.qrDataUrl} alt="QR พร้อมเพย์" style={{ margin: '0 auto', borderRadius: '0.5rem', background: 'var(--white)', padding: '0.5rem' }} />
                  <div style={{ color: 'var(--gold-primary)', fontWeight: 700, fontSize: '1.25rem', marginTop: '0.5rem' }}>฿{(depInfo.amount / 100).toLocaleString('th-TH')}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted-gray)', marginTop: '0.25rem' }}>สแกนด้วยแอปธนาคาร → โอนยอด <b style={{ color: 'var(--white)' }}>ตรงตามจำนวน</b></div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--muted-gray)', marginTop: '0.25rem' }}>Ref: <span style={{ fontFamily: 'monospace', color: 'var(--gold-primary)' }}>{depInfo.reference}</span></div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted-gray)', marginBottom: '0.375rem' }}>แนบรูปสลิปการโอน (JPG/PNG):</div>
                  <input type="file" accept="image/*"
                    onChange={e => setSlipFile(e.target.files?.[0] || null)}
                    style={{ width: '100%', fontSize: '0.875rem', color: 'var(--muted-gray)' }} />
                  {slipFile && <div style={{ fontSize: '0.75rem', color: 'var(--success-green)', marginTop: '0.25rem' }}>✓ {slipFile.name}</div>}
                  <div style={{ fontSize: '0.6875rem', color: 'var(--muted-gray)', marginTop: '0.5rem' }}>ระบบจะตรวจสอบสลิปอัตโนมัติ — ถ้าผ่าน เครดิตเข้าทันที ไม่ผ่านแอดมินจะตรวจสอบให้</div>
                </div>
              </div>
            ) : modal === 'deposit' ? (
              <div style={{ marginBottom: '0.75rem' }}>
                {payConfigured === false ? (
                  <div style={{ background: 'var(--bg-dark-surface)', border: '1px solid var(--border-light)', borderRadius: '0.5rem', padding: '0.75rem', fontSize: '0.75rem', color: 'var(--muted-gray)' }}>
                    <div style={{ color: 'var(--white)', fontWeight: 600, marginBottom: '0.25rem' }}>เติมเครดิตเดโม</div>
                    <div style={{ color: 'var(--muted-gray)' }}>กดยืนยันแล้วเครดิตเข้าทันที — ไม่เกี่ยวกับเงินจริง</div>
                  </div>
                ) : (
                <>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted-gray)', marginBottom: '0.375rem' }}>ช่องทาง: สแกน QR พร้อมเพย์ (แสดง QR หลังเลือกจำนวน)</div>
                <div style={{ background: 'var(--bg-dark-surface)', border: '1px solid var(--border-light)', borderRadius: '0.5rem', padding: '0.75rem', fontSize: '0.75rem', color: 'var(--muted-gray)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>ช่องทาง</span><span style={{ color: 'var(--white)', fontWeight: 600 }}>QR พร้อมเพย์</span></div>
                  <div style={{ color: 'var(--muted-gray)', marginTop: '0.25rem' }}>โอนเงิน → ได้ QR → สแกนจ่าย → แนบสลิป → เครดิตเข้าทันที</div>
                </div>
                </>
                )}
              </div>
            ) : payConfigured === false ? (
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted-gray)', marginBottom: '0.375rem' }}>(เดโม) กรอกปลายทางรับเครดิตถ้าต้องการ:</div>
                <input value={accountNo} onChange={e => setAccountNo(e.target.value)}
                  placeholder="เลขบัญชี/เบอร์ (ไม่บังคับ)"
                  style={{ width: '100%', background: 'var(--bg-dark-surface)', border: '1px solid var(--border-light)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', color: 'var(--white)', outline: 'none' }} />
              </div>
            ) : (
              <div style={{ marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted-gray)' }}>ข้อมูลบัญชีรับเงิน (แอดมินจะโอนให้):</div>
                <select value={bankName} onChange={e => setBankName(e.target.value)}
                  style={{ width: '100%', background: 'var(--bg-dark-surface)', border: '1px solid var(--border-light)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', color: 'var(--white)' }}>
                  <option value="">— เลือกธนาคาร —</option>
                  {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                <input value={accountNo} onChange={e => setAccountNo(e.target.value.replace(/[^\d-]/g, ''))}
                  placeholder="เลขบัญชี" inputMode="numeric"
                  style={{ width: '100%', background: 'var(--bg-dark-surface)', border: '1px solid var(--border-light)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', color: 'var(--white)', outline: 'none' }} />
                <input value={bankAccName} onChange={e => setBankAccName(e.target.value)}
                  placeholder="ชื่อบัญชี (ตามบัญชีธนาคาร)"
                  style={{ width: '100%', background: 'var(--bg-dark-surface)', border: '1px solid var(--border-light)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', color: 'var(--white)', outline: 'none' }} />
                <input value={ppId} onChange={e => setPpId(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder={user?.phone ? `PromptPay ID (แนะนำ: ${user.phone} — ตรงเบอร์ที่ยืนยัน OTP)` : 'PromptPay ID (เบอร์/เลข ปชช. — ช่วยยืนยันตัวตน)'}
                  inputMode="numeric"
                  style={{ width: '100%', background: 'var(--bg-dark-surface)', border: '1px solid var(--border-light)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', color: 'var(--white)', outline: 'none' }} />
                {ppId && user?.phone && (
                  <div style={{ fontSize: '0.6875rem', color: ppId === user.phone ? 'var(--success-green)' : 'var(--warning-amber)' }}>
                    {ppId === user.phone ? '✓ PromptPay ตรงกับเบอร์ที่ยืนยัน OTP แล้ว — เร็วต่อการอนุมัติ' : '⚠️ PromptPay ไม่ตรงเบอร์สมาชิก — แอดมินจะตรวจสอบเพิ่มเติม'}
                  </div>
                )}
                <div style={{ fontSize: '0.6875rem', color: 'var(--muted-gray)' }}>⚠️ คำขอถอนจะรอแอดมินตรวจสอบและโอนเงินจริงให้ — ระยะเวลา 1-3 วันทำการ</div>
              </div>
            )}
            {modal && depStep === 'form' && (
              <>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted-gray)', marginBottom: '0.375rem' }}>เลือกจำนวนเงินที่ต้องการ{modal === 'deposit' ? 'เติม' : 'ถอน'} (ขั้นต่ำ {modal === 'deposit' ? '1' : '100'} บาท):</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  {PRESETS.map(p => (
                    <button key={p} type="button" onClick={() => setAmount(String(p))}
                      style={{
                        padding: '0.625rem',
                        borderRadius: '0.5rem',
                        fontSize: '0.875rem',
                        fontWeight: 700,
                        border: '1px solid',
                        transition: 'all 0.2s',
                        background: Number(amount) === p ? 'var(--gold-primary)' : 'var(--bg-dark-surface)',
                        color: Number(amount) === p ? 'var(--bg-deep-black)' : 'var(--muted-gray)',
                        borderColor: Number(amount) === p ? 'var(--gold-primary)' : 'var(--border-light)',
                        cursor: 'pointer'
                      }}>
                      {p.toLocaleString()} บาท
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted-gray)', marginBottom: '0.375rem' }}>หรือกรอกจำนวนเอง:</div>
                <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                  inputMode="decimal" placeholder="0.00"
                  style={{ width: '100%', background: 'var(--bg-dark-surface)', border: '1px solid var(--border-light)', borderRadius: '0.5rem', padding: '0.75rem 1rem', fontSize: '1.25rem', textAlign: 'center', color: 'var(--gold-primary)', fontWeight: 700, outline: 'none' }} />
              </>
            )}
            {err && <div style={{ color: 'var(--danger-red)', fontSize: '0.875rem', marginTop: '0.5rem' }}>{err}</div>}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
              {(modal === 'deposit' && (depStep === 'qr' || depStep === 'slip')) ? (
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
                  ? ((depStep === 'qr' || depStep === 'slip') ? 'ส่งสลิปยืนยัน' : 'สร้าง QR พร้อมเพย์')
                  : 'ส่งคำขอถอน'}
              </Button>
            </div>
      </Modal>

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
          <div style={{ minHeight: '100%', display: 'flex' }}>
          <div style={{
            position: 'relative',
            margin: 'auto',
            background: 'var(--bg-card)',
            border: celebration.kind === 'win' ? '1px solid var(--border-gold)' : '1px solid var(--border-light)',
            borderRadius: '1.5rem',
            padding: '1.5rem 2rem',
            maxWidth: '24rem',
            width: '100%',
            maxHeight: '92dvh',
            overflowY: 'auto',
            textAlign: 'center',
            boxShadow: celebration.kind === 'win' ? 'var(--shadow-gold-lg)' : 'var(--shadow-lg)'
          }}>
            {celebration.kind === 'win' ? (
              <>
                <div style={{ fontSize: '3.75rem', marginBottom: '0.5rem' }}>🎉🏆</div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, background: 'linear-gradient(135deg, var(--gold-primary), var(--gold-bright))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', marginBottom: '0.25rem' }}>ยินดีด้วย!</h2>
                <p style={{ fontSize: '0.875rem', color: 'var(--muted-gray)', marginBottom: '0.75rem' }}>โพย <span style={{ fontFamily: 'monospace', color: 'var(--gold-primary)' }}>{celebration.slip.slip_ref}</span> ถูกรางวัล</p>
                <div style={{ fontSize: '1.875rem', fontWeight: 700, color: 'var(--success-green)', marginBottom: '0.25rem' }}>+{satang(celebration.slip.total_payout)} บาท</div>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted-gray)', marginBottom: '1.25rem' }}>เงินรางวัลเข้ากระเป๋าเครดิตแล้ว — แลกได้หลังปลดล็อก</p>
              </>
            ) : (
              <>
                <div style={{ fontSize: '3.75rem', marginBottom: '0.5rem' }}>😢💧</div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--info-blue)', marginBottom: '0.25rem' }}>เสียใจด้วย...</h2>
                <p style={{ fontSize: '0.875rem', color: 'var(--muted-gray)', marginBottom: '0.75rem' }}>โพย <span style={{ fontFamily: 'monospace', color: 'var(--gold-primary)' }}>{celebration.slip.slip_ref}</span> ไม่ถูกรางวัลรอบนี้</p>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--danger-red)', marginBottom: '0.25rem' }}>เสีย {satang(celebration.slip.total_stake)} บาท</div>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted-gray)', marginBottom: '1.25rem' }}>เก็บเครดิตไว้ลองใหม่นะ — ห้องยังเปิดรับแทงทุกวัน</p>
              </>
            )}
            <button onClick={() => setCelebration(null)}
              style={{
                width: '100%',
                fontWeight: 700,
                padding: '0.75rem',
                borderRadius: '0.75rem',
                background: celebration.kind === 'win' ? 'linear-gradient(135deg, var(--gold-gradient-start), var(--gold-gradient-end))' : 'var(--info-blue)',
                color: celebration.kind === 'win' ? 'var(--bg-deep-black)' : 'var(--white)',
                border: 'none',
                cursor: 'pointer',
                boxShadow: celebration.kind === 'win' ? 'var(--shadow-gold)' : 'none'
              }}>
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
