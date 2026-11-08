import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, satang, bahtToSatang, fmtDateTime, drawLabel } from '../api.js';
import { useAuth } from '../auth.jsx';
import Countdown from '../components/Countdown.jsx';
import { FlagIcon } from '../components/ResultLine.jsx';
import { SkeletonCard } from '../components/Skeleton.jsx';
import { typeAccent } from '../typeAccent.js';

const BET_TYPE_STYLE = {
  '2top': '2 ตัวบน', '2bottom': '2 ตัวล่าง', '3top': '3 ตัวบน',
  '3tod': '3 ตัวโต๊ด', 'run_top': 'วิ่งบน', 'run_bottom': 'วิ่งล่าง',
};

// เรียงประเภทการแทงตามลำดับที่คนทั่วไปคุ้นเคย
const BET_ORDER = ['first', 'num4', 'front3', 'last4', 'top3', 'last3', 'top2', 'bottom2', 'last2', 'run_top', 'run_bottom'];

export default function PlaceBet() {
  const { drawId } = useParams();
  const navigate = useNavigate();
  const { balance, setBalance, user } = useAuth();
  const [draw, setDraw] = useState(null);
  const [rules, setRules] = useState([]);
  const [slip, setSlip] = useState([]); // {ruleId, betType, name, number, amount(bet), stakeSatang}
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [confirming, setConfirming] = useState(false);
  // idempotency key: คงเดิมตลอดการพยายามส่งโพยเดียวกัน (กันโพยซ้ำตอน retry/เน็ตหลุด)
  const idemKey = useRef(null);
  const newIdemKey = () => { idemKey.current = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`); };

  // current entry
  const [selRule, setSelRule] = useState('');
  const [number, setNumber] = useState('');
  const [picks, setPicks] = useState([]);   // pattana5: เลขที่เลือก 1-45
  const [amount, setAmount] = useState('');

  // เปลี่ยนเนื้อหาโพย → key ใหม่ เพื่อไม่ให้โพยคนละชุดใช้ key เดียวกัน
  useEffect(() => { idemKey.current = null; }, [slip]);

  useEffect(() => {
    api(`/lottery/draws/${drawId}`).then(async r => {
      setDraw(r.draw);
      try {
        const t = await api(`/lottery/draws/${drawId}/rules`);
        const sorted = [...t.rules].sort((a, b) =>
          (BET_ORDER.indexOf(a.bet_type) === -1 ? 99 : BET_ORDER.indexOf(a.bet_type)) -
          (BET_ORDER.indexOf(b.bet_type) === -1 ? 99 : BET_ORDER.indexOf(b.bet_type)) || a.digits - b.digits);
        setRules(sorted);
        if (t.rules[0]) setSelRule(String(t.rules[0].id));
      } catch (e2) {
        if (e2.status === 401) { navigate('/login'); return; }
        setErr(e2.message);
      }
    }).catch(e => {
      if (e.status === 401) navigate('/login');
      else setErr(e.message);
    });
  }, [drawId]);

  const rule = rules.find(r => String(r.id) === selRule);
  const isPattana = rule?.bet_type === 'pattana5';
  const togglePick = (n) => setPicks(p => p.includes(n) ? p.filter(x => x !== n) : (p.length < 5 ? [...p, n] : p));

  const totalSatang = useMemo(() => slip.reduce((s, i) => s + i.stakeSatang, 0), [slip]);
  // ผลรางวัลจำลองแบบไม่รวมทุน = stake × multiplier ของแต่ละรายการ (เงินจริงจ่าย = ยอดนี้ ไม่ได้คืนทุนเพิ่ม)
  const itemPotential = (i) => Math.floor(i.stakeSatang * (i.mult || 0));
  const totalPotential = useMemo(() => slip.reduce((s, i) => s + itemPotential(i), 0), [slip]);
  const totalBaht = totalSatang / 100;

  // ตรวจจำนวนเงิน → satang (ใช้ร่วมกันทุกปุ่มเพิ่มโพย)
  const stakeFromAmount = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return { err: 'กรอกจำนวนเงิน' };
    const stake = bahtToSatang(amt);
    if (stake % rule.stake_unit !== 0) return { err: `จำนวนเงินต้องเป็นหน่วย ${rule.stake_unit / 100} บาท` };
    if (stake < rule.min_amount) return { err: `ขั้นต่ำ ฿${satang(rule.min_amount)}` };
    if (rule.max_amount && stake > rule.max_amount) return { err: `สูงสุด ฿${satang(rule.max_amount)}` };
    return { stake };
  };

  const addItem = () => {
    setErr('');
    if (!rule) return setErr('เลือกประเภทการแทง');
    let num;
    if (isPattana) {
      if (picks.length !== 5) return setErr('เลือกเลขให้ครบ 5 ตัว (1-45)');
      num = [...picks].sort((a, b) => a - b).map(n => String(n).padStart(2, '0')).join('-');
    } else {
      num = number.trim();
      if (!new RegExp(`^\\d{${rule.digits}}$`).test(num)) return setErr(`${rule.name_th} ต้องเป็นตัวเลข ${rule.digits} หลัก`);
    }
    const { stake, err: amtErr } = stakeFromAmount();
    if (amtErr) return setErr(amtErr);
    if (stake > balance) return setErr('เครดิตไม่เพียงพอ');
    setSlip([...slip, { ruleId: rule.id, betType: rule.bet_type, name: rule.name_th, number: num, stakeSatang: stake, mult: Number(rule.payout_multiplier) || 0 }]);
    setNumber(''); setPicks([]); setAmount('');
  };

  // ---- ปุ่มลัดสไตล์ LINE: แค่ช่วยกรอก/เพิ่มเลข ยังต้องกดยืนยันโพยเหมือนเดิม ----
  const randNum = (d) => Array.from({ length: d }, () => Math.floor(Math.random() * 10)).join('');

  const addRud19 = () => {
    setErr('');
    if (!rule || rule.digits !== 2) return;
    const num = number.trim();
    if (!/^\d{2}$/.test(num)) return setErr('กรอกเลข 2 หลักก่อน แล้วกด "รูด 19 ประตู"');
    const { stake, err: amtErr } = stakeFromAmount();
    if (amtErr) return setErr(amtErr);
    const [a, b] = num.split('');
    // รูด 19 ประตู = {a0..a9} ∪ {0b..9b} → 19 เลขพอดี (เลขกลับมีปุ่ม "กลับเลข" แยกอยู่)
    const set = new Set();
    for (let i = 0; i <= 9; i++) { set.add(a + i); set.add(i + b); }
    const nums = [...set];
    const need = nums.length * stake;
    if (totalSatang + need > balance) {
      return setErr(`เครดิตไม่พอ — รูด 19 ประตู = ${nums.length} รายการ รวม ฿${satang(need)} (คงเหลือ ฿${satang(balance - totalSatang)})`);
    }
    setSlip([...slip, ...nums.map(n => ({ ruleId: rule.id, betType: rule.bet_type, name: rule.name_th, number: n, stakeSatang: stake, mult: Number(rule.payout_multiplier) || 0 }))]);
    setNumber(''); setAmount('');
  };

  const submit = async () => {
    setErr(''); setBusy(true); setConfirming(false);
    if (!idemKey.current) newIdemKey();
    try {
      const r = await api('/bets', { method: 'POST', body: {
        drawId: Number(drawId),
        items: slip.map(i => ({ ruleId: i.ruleId, number: i.number, amount: i.stakeSatang })),
        idempotencyKey: idemKey.current,
      }});
      setBalance(r.balance);
      setDone(r);
      idemKey.current = null; // โพยถัดไปใช้ key ใหม่
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (done) return (
    <div className="max-w-md mx-auto bg-navy-800 border border-green-500/40 rounded-2xl p-8 text-center">
      <div className="text-5xl mb-3">🎉</div>
      <h1 className="text-xl font-bold text-green-400">ส่งโพยสำเร็จ!</h1>
      <p className="text-navy-200 mt-2">เลขที่โพย: <code className="text-gold-300">{done.slipRef}</code></p>
      <p className="text-navy-200">ยอดแทงรวม ฿{satang(done.totalStake)} • ยอดเครดิตคงเหลือ ฿{satang(done.balance)}</p>
      <div className="mt-6 flex gap-3 justify-center">
        <Link to="/my-bets" className="bg-gold-500 text-navy-950 font-bold px-5 py-2.5 rounded-lg">ดูโพยของฉัน</Link>
        <Link to={draw ? `/lotteries?type=${draw.lottery_type_id}` : '/lotteries'} className="border border-navy-600 px-5 py-2.5 rounded-lg">แทงรอบอื่น</Link>
      </div>
    </div>
  );

  if (err && !draw) return <div className="text-red-400 text-center py-10">{err}</div>;
  if (!draw) return <div className="max-w-3xl mx-auto space-y-4"><SkeletonCard className="h-28" /><SkeletonCard className="h-64" /></div>;

  const closed = draw.status !== 'open' || draw.close_at <= new Date().toISOString().slice(0,19).replace('T',' ');
  const ac = draw ? typeAccent(draw.type_code) : null;
  const headBar = <span className={`inline-block w-1.5 h-4 rounded-full ${ac?.bar || 'bg-gold-500'} mr-2 align-middle`} />;

  return (
    <div className="grid lg:grid-cols-5 gap-6">
      {/* left: entry form */}
      <div className="lg:col-span-3 space-y-4">
        <div className="bg-gradient-to-b from-navy-800 to-navy-900 border border-navy-700 rounded-xl p-5 shadow-lg shadow-black/20">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Link to={`/lotteries?type=${draw.lottery_type_id}`} className="text-sm text-gold-400 hover:text-gold-300">← เลือกรอบอื่นในหมวดนี้</Link>
              <div className="flex items-center gap-2 mt-1">
                <FlagIcon code={draw.type_code} className="w-9 h-6 text-[10px]" />
                <h1 className={`text-xl font-bold ${ac?.text || 'text-navy-950'}`}>{drawLabel(draw)}</h1>
              </div>
              <div className="text-sm text-navy-300">{draw.draw_code} • ออก {fmtDateTime(draw.draw_at)}</div>
              <div className="text-sm mt-1">⏱️ ปิดรับโพย: {!closed ? <Countdown closeAt={draw.close_at} /> : <span className="text-red-400 font-bold">ปิดรับแล้ว</span>}</div>
            </div>
            <span className={`text-xs font-bold px-3 py-1 rounded-full shrink-0 ${closed ? 'bg-navy-700 text-navy-300' : 'bg-green-500/20 text-green-300'}`}>
              {closed ? 'ปิดรับแล้ว' : 'เปิดรับ'}
            </span>
          </div>
        </div>

        {!closed && (
          <div className="bg-gradient-to-b from-navy-800 to-navy-900 border border-navy-700 rounded-xl p-5 space-y-4 shadow-lg shadow-black/20">
            <h2 className="font-bold text-navy-950">{headBar}เลือกประเภทการแทง</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {rules.map(r => (
                <button key={r.id} onClick={() => setSelRule(String(r.id))}
                  className={`px-3 py-3 rounded-lg text-sm border transition ${selRule === String(r.id) ? 'border-gold-500 bg-navy-700 text-gold-300' : 'border-navy-600 text-navy-200 hover:border-navy-500'}`}>
                  <div className="font-semibold">{r.name_th}</div>
                  <div className="text-xs text-navy-300">{r.bet_type === 'pattana5' ? 'เลือก 5 เลข 1-45' : `${r.digits} หลัก`} • จ่าย x{r.payout_multiplier}</div>
                </button>
              ))}
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {isPattana ? (
              <div className="sm:col-span-2">
                <label className="text-sm text-navy-300">เลือกเลข 5 ตัวจาก 1-45 (เลือกแล้ว {picks.length}/5)</label>
                <div className="grid grid-cols-5 sm:grid-cols-9 md:grid-cols-[repeat(15,minmax(0,1fr))] gap-1.5 mt-2">
                  {Array.from({ length: 45 }, (_, i) => i + 1).map(n => (
                    <button key={n} type="button" onClick={() => togglePick(n)}
                      className={`py-1.5 rounded text-xs font-mono font-bold border transition ${picks.includes(n) ? 'bg-gold-500 text-navy-950 border-gold-400' : 'bg-navy-900 border-navy-600 text-navy-200 hover:border-navy-400'}`}>
                      {n}
                    </button>
                  ))}
                </div>
                {picks.length > 0 && <div className="mt-2 text-sm font-mono text-gold-300">เลือก: {[...picks].sort((a,b)=>a-b).map(n=>String(n).padStart(2,'0')).join('-')}</div>}
              </div>
            ) : !rule ? (
            <div className="sm:col-span-2 text-navy-400 text-sm py-4 text-center">กำลังโหลดประเภทการแทง...</div>
            ) : (
            <>
            <div className="sm:col-span-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-navy-400">ปุ่มลัด:</span>
                <button type="button" onClick={() => setNumber(randNum(rule.digits))}
                  className="text-xs px-3 py-1.5 rounded-lg bg-navy-700 border border-navy-600 text-navy-200 hover:border-gold-500/60 hover:text-gold-300 transition">
                  🎲 สุ่มเลข
                </button>
                <button type="button" disabled={number.length < 2}
                  onClick={() => setNumber(number.split('').reverse().join(''))}
                  className="text-xs px-3 py-1.5 rounded-lg bg-navy-700 border border-navy-600 text-navy-200 hover:border-gold-500/60 hover:text-gold-300 transition disabled:opacity-40">
                  🔁 กลับเลข
                </button>
                {rule.digits === 2 && (
                  <button type="button" onClick={addRud19}
                    className="text-xs px-3 py-1.5 rounded-lg bg-gold-500/15 border border-gold-500/50 text-gold-300 hover:bg-gold-500/25 transition">
                    🎯 รูด 19 ประตู
                  </button>
                )}
                <span className="text-[10px] text-navy-500">* ปุ่มลัดช่วยกรอกเลขเท่านั้น — ต้องเพิ่มลงโพยและยืนยันอีกครั้ง</span>
              </div>
            </div>
            <div>
                <label className="text-sm text-navy-300">หมายเลข ({rule?.digits || '?'} หลัก)</label>
                <input value={number} onChange={e => setNumber(e.target.value.replace(/\D/g,'').slice(0, rule?.digits || 3))}
                  inputMode="numeric" placeholder={rule ? '0'.repeat(rule.digits) : ''}
                  className="mt-1 w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 text-2xl tracking-[0.4em] text-center text-gold-300 font-mono focus:outline-none focus:border-gold-500" />
              </div>
            </>
            )}
              <div>
                <label className="text-sm text-navy-300">จำนวนเงิน (บาท)</label>
                <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g,''))}
                  inputMode="decimal" placeholder="0.00"
                  className="mt-1 w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 text-2xl text-center text-gold-300 focus:outline-none focus:border-gold-500" />
              </div>
            </div>
            {err && <div className="text-red-400 text-sm">{err}</div>}
            <button onClick={addItem} className="w-full border border-gold-500/60 text-gold-300 font-semibold py-3 rounded-lg hover:bg-navy-700">
              + เพิ่มลงโพย
            </button>
          </div>
        )}
      </div>

      {/* right: bet slip */}
      <div className="lg:col-span-2">
        <div className="bg-gradient-to-b from-navy-800 to-navy-900 border border-gold-500/30 rounded-xl p-5 sticky top-24 shadow-xl shadow-gold-500/5">
          <h2 className={`font-bold mb-3 ${ac?.text || 'text-gold-400'}`}>{headBar}โพยของฉัน ({slip.length})</h2>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {slip.map((i, idx) => (
              <div key={idx} className="flex items-center justify-between bg-navy-900 rounded-lg px-3 py-2 text-sm">
                <div>
                  <span className="text-white font-mono text-lg">{i.number}</span>
                  <span className="text-navy-300 ml-2">{i.name}</span>
                  <div className="text-[10px] text-navy-500">ถ้าถูก ≈ ฿{satang(itemPotential(i))} (ไม่รวมทุน)</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gold-300">฿{satang(i.stakeSatang)}</span>
                  <button onClick={() => setSlip(slip.filter((_, j) => j !== idx))} className="text-red-400 hover:text-red-300">✕</button>
                </div>
              </div>
            ))}
            {!slip.length && <div className="text-navy-400 text-sm text-center py-6">ยังไม่มีรายการ — เลือกประเภทและกรอกตัวเลขทางซ้าย</div>}
          </div>
          <div className="border-t border-navy-700 mt-4 pt-4 space-y-1 text-sm">
            <div className="flex justify-between text-navy-300"><span>ยอดแทงรวม</span><span className="text-white font-bold text-lg">฿{satang(totalSatang)}</span></div>
            {slip.length > 0 && (
              <div className="flex justify-between text-navy-300"><span>รางวัลจำลองถ้าถูกทุกตัว (ไม่รวมทุน)</span><span className="text-green-400 font-bold">฿{satang(totalPotential)}</span></div>
            )}
            <div className="flex justify-between text-navy-300"><span>เครดิตคงเหลือ (หลังแทง)</span><span className="text-gold-300">฿{satang(balance - totalSatang)}</span></div>
          </div>
          <button onClick={() => setConfirming(true)} disabled={!slip.length || busy || closed || totalSatang > balance}
            className="mt-4 w-full bg-gold-500 text-navy-950 font-bold py-3 rounded-lg hover:bg-gold-400 disabled:opacity-40">
            ตรวจสอบและยืนยันโพย
          </button>
          {!user && <div className="text-center text-sm text-navy-300 mt-2"><Link to="/login" className="text-gold-400">เข้าสู่ระบบ</Link> เพื่อแทง</div>}
        </div>
      </div>

      {/* floating bet bar — มือถือ/แท็บเล็ต (slip panel อยู่ล่างจอ) */}
      {!closed && slip.length > 0 && !done && (
        <div className="lg:hidden fixed bottom-16 inset-x-0 z-30 px-4">
          <button onClick={() => setConfirming(true)} disabled={busy || totalSatang > balance}
            className="w-full bg-gradient-to-r from-gold-500 to-gold-600 text-navy-950 font-bold py-3 rounded-xl shadow-lg shadow-black/40 flex items-center justify-between px-5 disabled:opacity-50">
            <span className="text-sm">🧾 {slip.length} รายการ • ฿{satang(totalSatang)}</span>
            <span className="text-sm">ตรวจสอบโพย →</span>
          </button>
        </div>
      )}

      {/* confirm modal */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => !busy && setConfirming(false)}>
          <div className="bg-navy-800 border border-gold-500/40 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-navy-950 mb-1">{headBar}ยืนยันโพยหวย</h2>
            <p className="text-sm text-navy-300 mb-4">{drawLabel(draw)}</p>
            <div className="space-y-1.5 max-h-56 overflow-y-auto mb-4">
              {slip.map((i, idx) => (
                <div key={idx} className="flex justify-between text-sm bg-navy-900 rounded-lg px-3 py-2">
                  <span><span className="font-mono text-gold-300 text-base">{i.number}</span> <span className="text-navy-300">{i.name}</span></span>
                  <span className="text-gold-300">฿{satang(i.stakeSatang)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-navy-700 pt-3 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-navy-300">ยอดแทงรวม ({slip.length} รายการ)</span><span className="text-white font-bold text-lg">฿{satang(totalSatang)}</span></div>
              <div className="flex justify-between"><span className="text-navy-300">รางวัลจำลองถ้าถูกทุกตัว (ไม่รวมทุน)</span><span className="text-green-400 font-bold">฿{satang(totalPotential)}</span></div>
              <div className="flex justify-between"><span className="text-navy-300">เครดิตคงเหลือหลังแทง</span><span className="text-gold-300">฿{satang(balance - totalSatang)}</span></div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setConfirming(false)} disabled={busy}
                className="flex-1 border border-navy-600 text-navy-200 py-2.5 rounded-lg hover:bg-navy-700 disabled:opacity-40">
                แก้ไขต่อ
              </button>
              <button onClick={submit} disabled={busy}
                className="flex-1 bg-gold-500 text-navy-950 font-bold py-2.5 rounded-lg hover:bg-gold-400 disabled:opacity-40">
                {busy ? 'กำลังส่ง...' : 'ยืนยันส่งโพย'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
