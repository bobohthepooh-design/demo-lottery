import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { api, satang, bahtToSatang, fmtDateTime, drawLabel } from '../api.js';
import { useAuth } from '../auth.jsx';
import Countdown from '../components/Countdown.jsx';
import { FlagIcon } from '../components/ResultLine.jsx';
import { SkeletonCard } from '../components/Skeleton.jsx';
import { typeAccent } from '../typeAccent.js';
import { sfx } from '../sound.js';
import { kindBadge } from '../resultSource.js';
import { annSummary, annEntries } from '../ann.js';
import { bettingOpenAtSql, thaiHM } from '../bettingWindow.js';
import { Button } from '../components/ui/index.js';

const BET_TYPE_STYLE = {
  '2top': '2 ตัวบน', '2bottom': '2 ตัวล่าง', '3top': '3 ตัวบน', 'top4': '4 ตัวบน',
  '3tod': '3 ตัวโต๊ด', 'run_top': 'วิ่งบน', 'run_bottom': 'วิ่งล่าง',
  'ann_top': 'เลขอั้นบน', 'ann_bottom': 'เลขอั้นล่าง',
};

// เรียงประเภทการแทงตามลำดับที่คนทั่วไปคุ้นเคย
const BET_ORDER = ['first', '2top', '3top', 'top4', 'num4', 'front3', 'front3tod', 'last4', 'top3', '3tod', 'last3', 'top2', 'top2tod', 'bottom2', 'bottom2tod', 'last2', 'run_top', 'run_bottom', 'zodiac', 'zodiac3top', 'zodiac2bottom', 'zodiac_run'];

// 12 ปีนักษัตรไทย — ต้องตรงกับ server/src/lib/zodiac.js
const ZODIAC = ['ชวด', 'ฉลู', 'ขาล', 'เถาะ', 'มะโรง', 'มะเส็ง', 'มะเมีย', 'มะแม', 'วอก', 'ระกา', 'จอ', 'กุน'];
const ZODIAC_EMOJI = {
  'ชวด': '🐭', 'ฉลู': '🐂', 'ขาล': '🐯', 'เถาะ': '🐰',
  'มะโรง': '🐉', 'มะเส็ง': '🐍', 'มะเมีย': '🐴', 'มะแม': '🐐',
  'วอก': '🐵', 'ระกา': '🐓', 'จอ': '🐕', 'กุน': '🐷',
};

// คำอธิบายสั้นๆ ใต้ชื่อประเภท — บอกว่าต้องตรงกับส่วนไหนของผล (แสดงใต้ปุ่มประเภทที่เลือก)
const RULE_HINT = [
  [/^ann_/, 'ต้องเป็นเลขที่ประกาศอั้นเท่านั้น — อัตราจ่ายครึ่งหนึ่ง'],
  [/run_top/, 'ถูกถ้าเลขอยู่ใน 3 ตัวบน (ไม่ต้องตรงตำแหน่ง)'],
  [/run_bottom/, 'ถูกถ้าเลขอยู่ใน 2 ตัวล่าง (ไม่ต้องตรงตำแหน่ง)'],
  [/front3tod|3tod|top2tod|bottom2tod/, 'โต๊ด = ถูกแม้สลับลำดับเลข (ไม่รวมเต็ง)'],
  [/^first/, 'รางวัลที่ 1 — เลข 6 ตัวตรงเป๊ะ'],
  [/^num4|^last4/, 'เลขท้าย 4 ตัวตรงเป๊ะ'],
  [/^2top/, '2 ตัวบน — ตรงกับ 2 ตัวท้ายของรางวัลที่ 1'],
  [/^3top/, '3 ตัวบน — ตรงกับ 3 ตัวท้ายของรางวัลที่ 1'],
  [/^top4/, '4 ตัวบน — ตรงกับ 4 ตัวท้ายของรางวัลที่ 1'],
  [/^front3/, '3 ตัวล่างหน้า — 3 ตัวแรกของผลรางวัลที่ 1'],
  [/^top3/, '3 ตัวล่างหลัง — 3 ตัวท้ายของผลรางวัลที่ 1'],
  [/^last3/, 'เลขท้าย 3 ตัวตรงเป๊ะ'],
  [/^top2|^bottom2|^last2/, '2 ตัว — ตรงกับ 2 ตัวท้ายของผล'],
  [/zodiac3top/, 'เลือก 3 ราศีให้ตรงกับ 3 ตัวท้าย (④⑤⑥) เรียงลำดับ'],
  [/zodiac2bottom/, 'เลือก 2 ราศีให้ตรงกับ 2 ตัวท้าย (⑤⑥) เรียงลำดับ'],
  [/zodiac_run/, 'เลือกราศีที่โผล่ในผล 6 ตัว ไม่ว่าตำแหน่งไหนก็ได้'],
  [/^zodiac/, 'เลือกราศีที่ออกตัวแรกของผล 6 ตัว'],
  [/pattana/, 'เลือก 5 เลข 1-45 — ถูกตามลำดับที่ออก'],
];
// DD เดือน YYYY พ.ศ. จากเวลา UTC 'YYYY-MM-DD HH:MM:SS' (+7 ชม.) — รูปแบบเดียวกับ provider
const thaiDate = (sqlUtc) => {
  const t = Date.parse(String(sqlUtc || '').replace(' ', 'T') + 'Z');
  if (!Number.isFinite(t)) return '';
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(t + 7 * 3600e3));
};

const ruleHint = (r) => {
  if (!r) return '';
  const bt = r.bet_type || '';
  const hit = RULE_HINT.find(([re]) => re.test(bt));
  return hit ? hit[1] : `${r.digits || '?'} หลัก • จ่ายตรงตามกติกา`;
};

// คำอธิบายแต่ละประเภทแทงราศี — บอกชัดว่าต้องตรงกับตำแหน่งไหนของผล 6 ราศี
const ZODIAC_HINT = {
  zodiac: 'เลือกปีนักษัตรที่คาดว่าจะออก “ตัวแรก” ของผล 6 ตัว (ตำแหน่ง ①)',
  zodiac3top: 'เลือก 3 ปีนักษัตรให้ตรงกับ “3 ตัวท้าย” ของผล (④⑤⑥) เรียงลำดับ',
  zodiac2bottom: 'เลือก 2 ปีนักษัตรให้ตรงกับ “2 ตัวท้าย” ของผล (⑤⑥) เรียงลำดับ',
  zodiac_run: 'เลือกปีนักษัตรที่คิดว่าจะ “โผล่ในผล 6 ตัว” — ถูกไม่ว่าตำแหน่งไหนก็ได้',
};

export default function PlaceBet() {
  const { drawId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // แทงซ้ำจากหน้าประวัติโพย — {ref, items:[{ruleId, number, amount(satang), isTod}]}
  const repeat = location.state?.repeat || null;
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
  const [zodiacPicks, setZodiacPicks] = useState([]); // หวยราศี: ราศีที่เลือกเรียงตามลำดับ (สูงสุดตาม digits ของกติกา)
  const [amount, setAmount] = useState('');
  const [betMode, setBetMode] = useState('teng'); // 'teng' = เต็งอย่างเดียว | 'tengtod' = เต็ง+โต๊ด (ซื้อโต๊ดเพิ่มอีก 1 รายการ)
  const [recent, setRecent] = useState({}); // {digits: [num,...]} เลขที่เพิ่งแทง
  const [favs, setFavs] = useState(() => { try { return JSON.parse(localStorage.getItem('lotteryFavNums') || '{}'); } catch { return {}; } });
  const numRef = useRef(null); // auto-focus ช่องเลขหลังเพิ่มโพย — แทงต่อได้เร็ว

  // เปลี่ยนเนื้อหาโพย → key ใหม่ เพื่อไม่ให้โพยคนละชุดใช้ key เดียวกัน
  useEffect(() => { idemKey.current = null; }, [slip]);
  useEffect(() => { setBetMode('teng'); }, [selRule]);

  const loadDraw = () => api(`/lottery/draws/${drawId}`).then(async r => {
    setDraw(r.draw);
    try {
      const t = await api(`/lottery/draws/${drawId}/rules`);
      const sorted = [...t.rules].sort((a, b) =>
        (BET_ORDER.indexOf(a.bet_type) === -1 ? 99 : BET_ORDER.indexOf(a.bet_type)) -
        (BET_ORDER.indexOf(b.bet_type) === -1 ? 99 : BET_ORDER.indexOf(b.bet_type)) || a.digits - b.digits);
      setRules(sorted);
      // คงกติกาที่เลือกไว้ถ้ายังมี — ถ้าเพิ่งเข้าให้เลือกกติกาแรก
      setSelRule(prev => sorted.some(x => String(x.id) === prev) ? prev : (sorted[0] ? String(sorted[0].id) : ''));
    } catch (e2) {
      if (e2.status === 401) { navigate('/login'); return; }
      setErr(e2.message);
    }
  }).catch(e => {
    if (e.status === 401) navigate('/login');
    else setErr(e.message);
  });

  useEffect(() => { loadDraw(); }, [drawId]);

  // admin แก้กติกา/ราคา → SSE ดันมา refetch (ราคา/อัตราจ่ายตามล่าสุดทันที)
  useEffect(() => {
    const h = () => loadDraw();
    window.addEventListener('sys:update', h);
    return () => window.removeEventListener('sys:update', h);
  }, [drawId]);

  // เติมโพยจาก "แทงซ้ำ" — คำนวณ mult ใหม่ตามกติกาปัจจุบัน + เลขอั้นของรอบนี้ (ตรวจสอบก่อนยืนยันเหมือนโพยปกติ)
  const repeatDone = useRef(false);
  useEffect(() => {
    if (!repeat || repeatDone.current || !rules.length || !draw) return;
    repeatDone.current = true;
    const items = [];
    for (const it of repeat.items || []) {
      const r = rules.find(x => Number(x.id) === Number(it.ruleId));
      if (!r) continue; // กติกาถูกปิดไปแล้ว — ข้ามรายการนั้น
      const baseMult = Number(r.payout_multiplier) || 0;
      let mult = baseMult, isAnn = false;
      if (it.isTod) {
        try { const t = JSON.parse(r.match_config || '{}').tod; if (t != null) mult = Number(t); } catch {}
      } else {
        const entry = (String(it.number).length === 2 || String(it.number).length === 3)
          ? annEntries(draw.announce)[String(it.number).length === 3 ? 'top' : 'bottom']?.find(e => e.num === String(it.number))
          : null;
        if (entry) { mult = entry.mult ?? Math.floor(baseMult / 2); isAnn = true; }
      }
      items.push({ ruleId: r.id, betType: r.bet_type, name: r.name_th + (it.isTod ? ' (โต๊ด)' : ''),
        number: String(it.number), stakeSatang: Number(it.amount) || 0, mult, isTod: !!it.isTod, isAnn });
    }
    if (items.length) setSlip(items);
    else setErr('ไม่พบประเภทการแทงเดิมในรอบนี้ (กติกาอาจถูกปิดแล้ว)');
  }, [repeat, rules, draw]);

  const rule = rules.find(r => String(r.id) === selRule);
  // แสดงกติกาทั้งหมดของรอบนี้ — ไม่จัดกลุ่ม tab (ผู้ใช้ต้องการเห็นทุกประเภทพร้อมกัน)
  const isPattana = rule?.bet_type === 'pattana5';
  const isZodiac = rule?.bet_type?.startsWith('zodiac');
  // โต๊ด — อัตราโต๊ดฝังใน match_config ของกติกา (แสดงเป็นข้อความแจ้งเท่านั้น ผู้แทงไม่ต้องใส่เลขโต๊ด)
  const todRate = (() => { try { const t = JSON.parse(rule?.match_config || '{}').tod; return t != null ? Number(t) : null; } catch { return null; } })();
  const showTodHint = todRate != null && !isZodiac && !isPattana && rule?.digits >= 2 && rule?.digits <= 3;
  const zodiacDigits = rule?.digits || 1;
  const toggleZodiac = (z) => setZodiacPicks(p =>
    p.includes(z) ? p.filter(x => x !== z) : (p.length < zodiacDigits ? [...p, z] : p));
  const togglePick = (n) => setPicks(p => p.includes(n) ? p.filter(x => x !== n) : (p.length < 5 ? [...p, n] : p));

  // เลขโปรด — จำแยกตามจำนวนหลัก (localStorage ของเครื่องผู้ใช้ ไม่ผูกบัญชี)
  const favKey = rule && !isZodiac && !isPattana ? rule.digits : 0;
  const favList = favKey ? (favs[favKey] || []) : [];
  const recentList = favKey ? (recent[favKey] || JSON.parse(localStorage.getItem('lotteryRecent_' + favKey) || '[]')) : [];
  const saveFav = (num) => {
    if (!favKey || !new RegExp(`^\\d{${favKey}}$`).test(num)) return;
    const list = favs[favKey] || [];
    if (list.includes(num)) return;
    const next = { ...favs, [favKey]: [num, ...list].slice(0, 12) };
    setFavs(next); localStorage.setItem('lotteryFavNums', JSON.stringify(next));
  };
  const pickFav = (num) => { setNumber(num); setTimeout(() => numRef.current?.focus(), 30); };

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
    if (stake < rule.min_amount) return { err: `ขั้นต่ำ ${satang(rule.min_amount)} บาท` };
    if (rule.max_amount && stake > rule.max_amount) return { err: `สูงสุด ${satang(rule.max_amount)} บาท` };
    return { stake };
  };

  const addItem = () => {
    setErr('');
    if (!rule) return setErr('เลือกประเภทการแทง');
    let num;
    if (isZodiac) {
      if (zodiacPicks.length !== zodiacDigits) return setErr(`กรุณาเลือก ${zodiacDigits} ราศีตามลำดับ`);
      num = zodiacPicks.join('-');
    } else if (isPattana) {
      if (picks.length !== 5) return setErr('เลือกเลขให้ครบ 5 ตัว (1-45)');
      num = [...picks].sort((a, b) => a - b).map(n => String(n).padStart(2, '0')).join('-');
    } else {
      num = number.trim();
      if (!new RegExp(`^\\d{${rule.digits}}$`).test(num)) return setErr(`${rule.name_th} ต้องเป็นตัวเลข ${rule.digits} หลัก`);
    }
    const { stake, err: amtErr } = stakeFromAmount();
    if (amtErr) return setErr(amtErr);
    if (stake > balance) return setErr('เครดิตไม่เพียงพอ');
    // เลขอั้น — server ใช้อัตราเลขอั้นเฉพาะเลข 2-3 หลัก (4+ หลักไม่เข้าเงื่อนไข ann)
    const baseMult = Number(rule.payout_multiplier) || 0;
    const annEntry = (num.length === 2 || num.length === 3)
      ? (annEntries(draw.announce)[num.length === 3 ? 'top' : 'bottom']?.find(e => e.num === num) || null)
      : null;
    const mult = annEntry ? (annEntry.mult ?? Math.floor(baseMult / 2)) : baseMult;
    const items = [{ ruleId: rule.id, betType: rule.bet_type, name: rule.name_th, number: num, stakeSatang: stake, mult, isAnn: !!annEntry }];
    // โต๊ด — ต้องซื้อเพิ่มเป็นรายการแยก (is_tod) จ่ายอัตรา match_config.tod เมื่อเลขครบทุกหลักไม่สนลำดับ
    if (betMode === 'tengtod' && showTodHint) {
      items.push({ ruleId: rule.id, betType: rule.bet_type, name: rule.name_th + ' (โต๊ด)', number: num, stakeSatang: stake, mult: todRate, isTod: true });
    }
    setSlip([...slip, ...items]);
    setNumber(''); setPicks([]); setZodiacPicks([]);
    sfx.chip(); // เสียงเหรียญตอนเพิ่มโพย
    // จำเลขที่เพิ่งแทงไว้ — แสดงเป็น chips กดซ้ำได้ (localStorage แยกตามจำนวนหลัก)
    if (!isZodiac && !isPattana && /^\d+$/.test(num)) {
      try {
        const key = 'lotteryRecent_' + rule.digits;
        const list = JSON.parse(localStorage.getItem(key) || '[]').filter(x => x !== num);
        list.unshift(num);
        localStorage.setItem(key, JSON.stringify(list.slice(0, 10)));
        setRecent(prev => ({ ...prev, [rule.digits]: list.slice(0, 10) }));
      } catch {}
    }
    // คงจำนวนเงินไว้ — แทงหลายเลขด้วยเงินเท่ากันได้ต่อเนื่อง + refocus ช่องเลขให้กรอกเลขถัดไปทันที
    setTimeout(() => numRef.current?.focus(), 50);
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
      return setErr(`เครดิตไม่พอ — รูด 19 ประตู = ${nums.length} รายการ รวม ${satang(need)} บาท (คงเหลือ ${satang(balance - totalSatang)} บาท)`);
    }
    const baseMult = Number(rule.payout_multiplier) || 0;
    setSlip([...slip, ...nums.map(n => {
      const entry = annEntries(draw.announce).bottom.find(e => e.num === n) || null;
      return { ruleId: rule.id, betType: rule.bet_type, name: rule.name_th, number: n, stakeSatang: stake,
        mult: entry ? (entry.mult ?? Math.floor(baseMult / 2)) : baseMult, isAnn: !!entry };
    })]);
    setNumber(''); setAmount('');
  };

  // เลขตอง (หลักซ้ำกันหมด เช่น 00-99 / 000-999) และเลขเบิ้ล (3 หลัก มีตัวซ้ำ 2 ตัว)
  // — pattern betting แบบ provider: เพิ่มทั้งชุดเป็นโพยเดียวผ่านการตรวจเดียว
  const addPattern = (kind) => {
    setErr('');
    if (!rule || isZodiac || isPattana) return;
    const d = rule.digits;
    if (d < 2) return setErr('เลขตอง/เบิ้ลใช้ได้กับประเภท 2-3 หลัก');
    const { stake, err: amtErr } = stakeFromAmount();
    if (amtErr) return setErr(amtErr);
    let nums;
    if (kind === 'tod') { // เลขตอง — ทุกหลักเป็นเลขเดียวกัน (10 เลข)
      nums = Array.from({ length: 10 }, (_, i) => String(i).repeat(d));
    } else { // เลขเบิ้ล — เฉพาะ 3 หลัก: มีตัวเลขซ้ำกัน 2 ตัว (เช่น 112/121/211)
      if (d !== 3) return setErr('เลขเบิ้ลใช้ได้กับประเภท 3 หลัก');
      nums = [];
      for (let p = 0; p <= 9; p++) for (let o = 0; o <= 9; o++) {
        if (o === p) continue;
        nums.push(`${p}${p}${o}`, `${p}${o}${p}`, `${o}${p}${p}`);
      }
    }
    const need = nums.length * stake;
    if (totalSatang + need > balance) {
      return setErr(`เครดิตไม่พอ — ${kind === 'tod' ? 'เลขตอง' : 'เลขเบิ้ล'} = ${nums.length} รายการ รวม ${satang(need)} บาท (คงเหลือ ${satang(balance - totalSatang)} บาท)`);
    }
    const baseMult = Number(rule.payout_multiplier) || 0;
    const digitsKey = d === 3 ? 'top' : 'bottom';
    const annList = annEntries(draw.announce)[digitsKey] || [];
    setSlip([...slip, ...nums.map(n => {
      const entry = (n.length === 2 || n.length === 3) ? annList.find(e => e.num === n) || null : null;
      return { ruleId: rule.id, betType: rule.bet_type, name: rule.name_th + (kind === 'tod' ? ' (ตอง)' : ' (เบิ้ล)'), number: n, stakeSatang: stake,
        mult: entry ? (entry.mult ?? Math.floor(baseMult / 2)) : baseMult, isAnn: !!entry };
    })]);
    setNumber(''); setAmount('');
  };

  const submit = async () => {
    setErr(''); setBusy(true); setConfirming(false);
    if (!idemKey.current) newIdemKey();
    try {
      const r = await api('/bets', { method: 'POST', body: {
        drawId: Number(drawId),
        items: slip.map(i => ({ ruleId: i.ruleId, number: i.number, amount: i.stakeSatang, ...(i.isTod ? { tod: true } : {}) })),
        idempotencyKey: idemKey.current,
      }});
      setBalance(r.balance);
      setDone(r);
      idemKey.current = null; // โพยถัดไปใช้ key ใหม่
      sfx.bet();
      navigator.vibrate?.(60); // haptic สั่นเบาๆ ยืนยันส่งโพย (มือถือ/แท็บเล็ต)
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (done) return (
    <div className="max-w-md mx-auto bg-navy-800 border border-green-500/40 rounded-2xl p-8 text-center">
      <div className="text-5xl mb-3">🎉</div>
      <h1 className="text-xl font-bold text-green-400">ส่งโพยสำเร็จ!</h1>
      <p className="text-navy-200 mt-2">เลขที่โพย: <code className="text-gold-300">{done.slipRef}</code></p>
      <p className="text-navy-200">ยอดแทงรวม {satang(done.totalStake)} บาท • ยอดเครดิตคงเหลือ {satang(done.balance)} บาท</p>
      <div className="mt-6 flex gap-3 justify-center">
        <Button to="/my-bets">ดูโพยของฉัน</Button>
        <Button to="/play" variant="secondary">เลือกตลาด/รอบอื่น</Button>
      </div>
    </div>
  );

  if (err && !draw) return <div className="text-red-400 text-center py-10">{err}</div>;
  if (!draw) return <div className="max-w-3xl mx-auto space-y-4"><SkeletonCard className="h-28" /><SkeletonCard className="h-64" /></div>;

  // เทียบกับเวลา server (draw.server_now) — fallback นาฬิกาเครื่องถ้า field ไม่มี
  const nowSqlPB = draw.server_now || new Date().toISOString().slice(0,19).replace('T',' ');
  const opensAt = draw ? bettingOpenAtSql(draw.close_at, draw.type_code) : null;
  const notYetOpen = !!(draw && draw.status === 'open' && draw.close_at > nowSqlPB && opensAt && nowSqlPB < opensAt);
  const closed = draw.status !== 'open' || draw.close_at <= nowSqlPB || notYetOpen;
  const ac = draw ? typeAccent(draw.type_code) : null;
  const kb = kindBadge(draw.result_kind);
  const headBar = <span className={`inline-block w-1.5 h-4 rounded-full ${ac?.bar || 'bg-gold-500'} mr-2 align-middle`} />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* left: entry form */}
      <div className="lg:col-span-3 space-y-4">
        {/* Header — Draw Info + Countdown */}
        <div className="bg-gradient-to-br from-navy-800 to-navy-900 border border-navy-700/60 rounded-xl p-4 sm:p-5 shadow-lg shadow-black/20">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <Link to="/play" className="text-xs sm:text-sm text-gold-400 hover:text-gold-300 font-medium">← เลือกตลาด/รอบอื่น</Link>
              <div className="flex items-center gap-2 sm:gap-3 mt-2">
                <FlagIcon code={draw.type_code} className="w-8 h-6 sm:w-10 sm:h-7 text-[10px] sm:text-[11px] rounded-md" />
                <div className="min-w-0">
                  <h1 className={`text-lg sm:text-2xl font-black ${ac?.text || 'text-white'} truncate`}>{drawLabel(draw)}</h1>
                  <div className="text-xs sm:text-sm text-navy-300 font-medium">
                    {thaiDate(draw.draw_at)} • ปิดรับ {thaiHM(draw.close_at)} น.
                    <span className="text-navy-500 text-[10px] ml-2 font-mono">{draw.draw_code}</span>
                  </div>
                </div>
              </div>
              {(() => { const s = annSummary(draw.announce); return s ? (
                <div className="mt-2 sm:mt-3 inline-flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs font-bold px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-amber-500/15 border border-amber-500/50 text-amber-300">
                  📣 เลขอั้น: {s}
                </div>
              ) : null; })()}
            </div>
            <div className="flex flex-col items-end gap-1.5 sm:gap-2 shrink-0">
              {kb && <span className={`text-[9px] sm:text-[10px] px-2 sm:px-2.5 py-1 rounded-full font-bold ${kb.cls}`}>{kb.label}</span>}
              <span className={`text-[10px] sm:text-xs font-bold px-3 sm:px-4 py-1 sm:py-1.5 rounded-full ${closed ? 'bg-navy-700 text-navy-300' : 'bg-green-500/20 text-green-300 border border-green-500/40'}`}>
                {notYetOpen ? `⏳ เปิดรับ ${thaiHM(opensAt)} น.` : closed ? 'ปิดรับแล้ว' : '● รับแทงอยู่'}
              </span>
            </div>
          </div>
          {/* countdown — แถวเต็มความกว้างแยกจากหัวข้อ กันข้อความยาวดันชื่อรอบจนมองไม่เห็นบนมือถือ */}
          {!closed && (
            <div className="mt-3 pt-3 border-t border-navy-700/50 flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[10px] sm:text-xs text-navy-400 font-medium">เหลือเวลา</span>
              <span className="text-gold-300 font-mono font-bold text-sm sm:text-lg">
                <Countdown closeAt={draw.close_at} />
              </span>
            </div>
          )}
        </div>

        {!closed && (
          <div className="bg-gradient-to-br from-navy-800 to-navy-900 border border-navy-700/60 rounded-xl p-5 space-y-5 shadow-lg shadow-black/20">
            {/* Bet Type Selector — Grid layout, all visible */}
            <div>
              <h2 className="font-bold text-white text-lg mb-1 flex items-center gap-2">
                <span className="w-1 h-5 bg-gold-500 rounded-full" />
                เลือกประเภทการแทง
              </h2>
              {rule && <div className="text-xs text-navy-400 mb-3 ml-3">💡 {ruleHint(rule)}</div>}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {rules.map(r => {
                  const isAnn = r.bet_type?.startsWith('ann_');
                  const isSel = selRule === String(r.id);
                  return (
                    <button key={r.id} onClick={() => setSelRule(String(r.id))}
                      className={`px-2 py-2 rounded-xl border transition-all duration-200 text-left ${
                        isSel 
                          ? 'border-gold-500 bg-gold-500/10 text-gold-300 shadow-lg shadow-gold-500/10' 
                          : 'border-navy-600 bg-navy-800/50 text-navy-200 hover:border-navy-500 hover:bg-navy-800'
                      }`}>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <div className="font-bold text-xs sm:text-sm truncate flex items-center gap-1 min-w-0">
                          {isAnn && <span className="text-[8px] sm:text-[9px] font-bold px-1 py-0.5 rounded bg-amber-500/20 border border-amber-500/50 text-amber-300 shrink-0">อั้น</span>}
                          <span className="truncate">{r.name_th}</span>
                        </div>
                        <span className={`text-[10px] sm:text-xs font-mono font-bold px-1 py-0.5 rounded shrink-0 ${isSel ? 'bg-gold-500/20 text-gold-300' : 'bg-black/20 text-gold-400'}`}>x{r.payout_multiplier}</span>
                      </div>
                      <div className="text-[9px] sm:text-[10px] text-navy-400 leading-tight">
                        {r.bet_type === 'pattana5' ? 'เลือก 5 เลข 1-45' : r.bet_type?.startsWith('zodiac') ? (r.digits > 1 ? `${r.digits} ราศี` : '1 ราศี') : `${r.digits} หลัก`}
                        {isAnn && <span className="text-amber-400"> • ครึ่งรางวัล</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Number Input Area */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {isZodiac ? (
                <div className="sm:col-span-2">
                  <label className="text-sm font-semibold text-navy-200 mb-2 block">
                    เลือกปีนักษัตร {zodiacDigits > 1 ? `(เลือก ${zodiacDigits} ตัวตามลำดับ)` : '(1 ใน 12)'}
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 sm:gap-2">
                    {ZODIAC.map(z => {
                      const idx = zodiacPicks.indexOf(z);
                      const sel = idx >= 0;
                      const full = !sel && zodiacPicks.length >= zodiacDigits;
                      return (
                        <button key={z} type="button" onClick={() => toggleZodiac(z)} disabled={full}
                          className={`py-3 rounded-xl border transition-all duration-200 flex flex-col items-center gap-1 ${
                            sel 
                              ? 'bg-violet-500 text-white border-violet-400 font-bold shadow-lg shadow-violet-500/20' 
                              : 'bg-navy-800/50 border-navy-600 text-navy-200 hover:border-violet-400 hover:bg-navy-800'
                          } disabled:opacity-40`}>
                          <span className="text-2xl leading-none">{ZODIAC_EMOJI[z]}</span>
                          <span className={`text-[10px] leading-tight ${sel ? 'text-white' : 'text-navy-400'}`}>{sel ? `${idx + 1}. ${z}` : z}</span>
                        </button>
                      );
                    })}
                  </div>
                  {zodiacPicks.length > 0 && (
                    <div className="mt-3 text-sm font-mono text-violet-300 flex items-center gap-2 flex-wrap bg-violet-500/10 rounded-lg px-3 py-2">
                      ผล: {zodiacPicks.map((z, i) => (
                        <span key={i} className="inline-flex items-center gap-1">
                          {i > 0 && <span className="text-navy-500">→</span>}
                          <span className="text-lg leading-none">{ZODIAC_EMOJI[z]}</span>{z}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 rounded-lg bg-violet-500/10 border border-violet-500/30 p-4 text-xs text-navy-200 space-y-1">
                    <div className="font-semibold text-violet-300">📖 ผลรางวัล = ปีนักษัตร 6 ตัวไม่ซ้ำ เรียงลำดับ</div>
                    <div>เช่น <span className="font-mono text-gold-300">ขาล-เถาะ-มะโรง-มะเส็ง-มะเมีย-มะแม</span></div>
                    <div>① ตัวแรก = รางวัลใหญ่ • ④⑤⑥ สามตัวท้าย = 3 บน • ⑤⑥ สองตัวท้าย = 2 ล่าง • ปีนักษัตรไหนก็ได้ = วิ่ง</div>
                    {rule?.bet_type && ZODIAC_HINT[rule.bet_type] && (
                      <div className="text-violet-300 font-medium">→ {ZODIAC_HINT[rule.bet_type]}</div>
                    )}
                  </div>
                </div>
              ) : isPattana ? (
                <div className="sm:col-span-2">
                  <label className="text-sm font-semibold text-navy-200 mb-2 block">
                    เลือกเลข 5 ตัวจาก 1-45 (เลือกแล้ว {picks.length}/5)
                  </label>
                  <div className="grid grid-cols-5 sm:grid-cols-9 md:grid-cols-[repeat(15,minmax(0,1fr))] gap-1.5">
                    {Array.from({ length: 45 }, (_, i) => i + 1).map(n => (
                      <button key={n} type="button" onClick={() => togglePick(n)}
                        className={`py-2.5 rounded-lg text-sm font-mono font-bold border transition-all duration-200 ${
                          picks.includes(n) 
                            ? 'bg-gold-500 text-navy-950 border-gold-400 shadow-lg shadow-gold-500/20' 
                            : 'bg-navy-800/50 border-navy-600 text-navy-200 hover:border-navy-500 hover:bg-navy-800'
                        }`}>
                        {n}
                      </button>
                    ))}
                  </div>
                  {picks.length > 0 && (
                    <div className="mt-3 text-sm font-mono text-gold-300 bg-gold-500/10 rounded-lg px-3 py-2">
                      เลือก: {[...picks].sort((a,b)=>a-b).map(n=>String(n).padStart(2,'0')).join('-')}
                    </div>
                  )}
                </div>
              ) : !rule ? (
                <div className="sm:col-span-2 text-navy-400 text-sm py-8 text-center">กำลังโหลดประเภทการแทง...</div>
              ) : (
                <>
                  {/* Quick Actions */}
                  <div className="sm:col-span-2">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className="text-xs text-navy-400 font-medium">ปุ่มลัด:</span>
                      <button type="button" onClick={() => setNumber(randNum(rule.digits))}
                        className="text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-navy-700/50 border border-navy-600 text-navy-200 hover:border-gold-500/60 hover:text-gold-300 transition-all">
                        🎲 สุ่มเลข
                      </button>
                      <button type="button" disabled={number.length < 2}
                        onClick={() => setNumber(number.split('').reverse().join(''))}
                        className="text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-navy-700/50 border border-navy-600 text-navy-200 hover:border-gold-500/60 hover:text-gold-300 transition-all disabled:opacity-40">
                        🔁 กลับเลข
                      </button>
                      {draw.type_code === 'TH' && rule.digits === 2 && !rule.bet_type?.startsWith('ann_') && (
                        <button type="button" onClick={addRud19}
                          className="text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-gold-500/15 border border-gold-500/50 text-gold-300 hover:bg-gold-500/25 transition-all">
                          🎯 รูด 19 ประตู
                        </button>
                      )}
                      {rule.digits >= 2 && (
                        <>
                          <button type="button" onClick={() => addPattern('tod')}
                            className="text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-navy-700/50 border border-navy-600 text-navy-200 hover:border-gold-500/60 hover:text-gold-300 transition-all">
                            🔢 เลขตอง
                          </button>
                          {rule.digits === 3 && (
                            <button type="button" onClick={() => addPattern('be')}
                              className="text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-navy-700/50 border border-navy-600 text-navy-200 hover:border-gold-500/60 hover:text-gold-300 transition-all">
                              🔢 เลขเบิ้ล
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Number Input */}
                  <div>
                    <label className="text-sm font-semibold text-navy-200 mb-2 block">หมายเลข ({rule?.digits || '?'} หลัก)</label>
                    <input ref={numRef} value={number} onChange={e => setNumber(e.target.value.replace(/\D/g,'').slice(0, rule?.digits || 3))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
                      inputMode="numeric" placeholder={rule ? '0'.repeat(rule.digits) : ''}
                      className="w-full bg-navy-900/80 border border-navy-600 rounded-xl px-3 py-3 sm:px-4 sm:py-4 text-2xl sm:text-3xl tracking-[0.3em] sm:tracking-[0.5em] text-center text-gold-300 font-mono font-bold focus:outline-none focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20 transition-all" />
                    {favKey > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {favList.map(f => (
                          <button key={f} type="button" onClick={() => pickFav(f)}
                            className="text-xs px-2.5 py-1.5 rounded-lg bg-navy-800/50 border border-gold-500/40 text-gold-300 font-mono hover:bg-navy-700 hover:border-gold-500/60 transition-all">{f}</button>
                        ))}
                        {favList.length === 0 && recentList.length === 0 && <span className="text-[10px] text-navy-500">เลขโปรดที่บันทึกไว้จะแสดงที่นี่</span>}
                        {new RegExp(`^\\d{${favKey}}$`).test(number) && !favList.includes(number) && (
                          <button type="button" onClick={() => saveFav(number)}
                            className="text-[10px] px-2 py-1 rounded-lg border border-navy-600 text-navy-300 hover:border-gold-500/50 hover:text-gold-300 transition-all">⭐ บันทึกเลขนี้</button>
                        )}
                      </div>
                    )}
                    {favKey > 0 && recentList.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <span className="text-[10px] text-navy-500 font-medium">เพิ่งแทง:</span>
                        {recentList.map(f => (
                          <button key={f} type="button" onClick={() => pickFav(f)}
                            className="text-[10px] px-2 py-1 rounded bg-navy-800/50 border border-navy-700 text-navy-300 font-mono hover:border-gold-500/50 hover:text-gold-300 transition-all">{f}</button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Amount Input */}
                  <div>
                    <label className="text-sm font-semibold text-navy-200 mb-2 block">จำนวนเงิน (บาท)</label>
                    <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g,''))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
                      inputMode="decimal" placeholder="0.00"
                      className="w-full bg-navy-900/80 border border-navy-600 rounded-xl px-3 py-3 sm:px-4 sm:py-4 text-2xl text-center text-gold-300 font-mono font-bold focus:outline-none focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20 transition-all" />
                    <div className="grid grid-cols-4 gap-1.5 mt-2">
                      {[1, 5, 10, 20, 50, 100, 200, 500].map(v => (
                        <button key={v} type="button" onClick={() => setAmount(String(v))}
                          className={`text-xs py-1.5 sm:py-2 rounded-lg border font-bold transition-all duration-200 ${Number(amount) === v ? 'border-gold-500 bg-gold-500/20 text-gold-300' : 'border-navy-600 bg-navy-800/50 text-navy-300 hover:border-gold-500/50 hover:text-gold-300'}`}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Tod Mode Selector */}
            {showTodHint && !isZodiac && !isPattana && (
              <div className="space-y-2">
                <div className="text-xs text-sky-400 font-medium">💡 โต๊ด = เลขครบทุกหลักไม่สนลำดับ (รวมตรงเป๊ะ) จ่าย x{todRate}</div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setBetMode('teng')}
                    className={`text-xs sm:text-sm py-2.5 sm:py-3 px-2 sm:px-3 rounded-xl border font-semibold transition-all duration-200 text-center ${betMode === 'teng' ? 'border-gold-500 bg-gold-500/15 text-gold-300 shadow-lg shadow-gold-500/10' : 'border-navy-600 bg-navy-800/50 text-navy-300 hover:border-navy-500'}`}>
                    <div className="font-bold">เต็งอย่างเดียว</div>
                    <div className="text-[9px] sm:text-[10px] font-normal mt-1 opacity-80">เฉพาะเลขตรงเป๊ะ • จ่าย x{rule.payout_multiplier}</div>
                  </button>
                  <button type="button" onClick={() => setBetMode('tengtod')}
                    className={`text-xs sm:text-sm py-2.5 sm:py-3 px-2 sm:px-3 rounded-xl border font-semibold transition-all duration-200 text-center ${betMode === 'tengtod' ? 'border-sky-500 bg-sky-500/15 text-sky-300 shadow-lg shadow-sky-500/10' : 'border-navy-600 bg-navy-800/50 text-navy-300 hover:border-navy-500'}`}>
                    <div className="font-bold">เต็ง + โต๊ด</div>
                    <div className="text-[9px] sm:text-[10px] font-normal mt-1 opacity-80">ตรงเป๊ะได้ x{Number(rule.payout_multiplier) + todRate} • สลับลำดับได้ x{todRate}</div>
                  </button>
                </div>
                {betMode === 'tengtod' && <div className="text-[10px] text-navy-400">ซื้อทั้งเต็งและโต๊ด — เสียเงินรวม ×2 (เช่น 100 บาท → เต็ง 100 + โต๊ด 100) • ผลตรงได้ทั้งคู่ ผลสลับได้แค่โต๊ด</div>}
              </div>
            )}

            {err && <div className="text-red-400 text-xs sm:text-sm font-medium bg-red-500/10 rounded-lg px-3 py-2">{err}</div>}
            <Button onClick={addItem} variant="secondary" className="w-full !py-3 sm:!py-4 text-base sm:text-lg font-bold border-gold-500/60 text-gold-300 hover:bg-navy-700">
              + เพิ่มลงโพย
            </Button>
          </div>
        )}
      </div>

      {/* right: bet slip */}
      <div className="lg:col-span-2">
        <div className="bg-gradient-to-b from-navy-800 to-navy-900 border border-gold-500/30 rounded-xl p-4 sm:p-5 sticky top-24 shadow-xl shadow-gold-500/5">
          <div className="flex items-center justify-between mb-3">
            <h2 className={`font-bold text-sm sm:text-base ${ac?.text || 'text-gold-400'}`}>{headBar}โพยของฉัน ({slip.length})</h2>
            {slip.length > 0 && (
              <button onClick={() => { if (confirm('ล้างรายการทั้งหมดในโพย?')) setSlip([]); }}
                className="text-[10px] text-navy-400 hover:text-red-400 transition">ล้างทั้งหมด</button>
            )}
          </div>
          {repeat && slip.length > 0 && (
            <div className="mb-3 text-[11px] bg-sky-500/10 border border-sky-500/40 text-sky-300 rounded-lg px-3 py-2 flex items-center justify-between">
              <span>🔁 bettor ซ้ำจากโพย {repeat.ref} — ตรวจสอบแล้วยืนยันได้เลย</span>
              <button onClick={() => { setSlip([]); repeatDone.current = true; navigate(location.pathname, { replace: true }); }}
                className="text-sky-400 hover:underline shrink-0 ml-2">ล้าง</button>
            </div>
          )}
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {slip.map((i, idx) => (
              <div key={idx} className="flex items-center justify-between bg-navy-900 rounded-lg px-3 py-2 text-sm animate-slip-in">
                <div className="min-w-0 flex-1">
                  <span className="text-white font-mono text-base sm:text-lg">{i.number}</span>
                  <span className="text-navy-300 ml-2 text-xs sm:text-sm">{i.name}</span>
                  {i.isAnn && <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/50 text-amber-300">เลขอั้น</span>}
                  {i.isTod && <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-500/20 border border-sky-500/50 text-sky-300">โต๊ด</span>}
                  <div className="text-[10px] text-navy-500 mt-0.5">ถ้าถูก ≈ {satang(itemPotential(i))} บาท (ไม่รวมทุน)</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-gold-300 text-sm sm:text-base">{satang(i.stakeSatang)} บาท</span>
                  <button onClick={() => setSlip(slip.filter((_, j) => j !== idx))} className="text-red-400 hover:text-gold-300 text-sm sm:text-base">✕</button>
                </div>
              </div>
            ))}
            {!slip.length && <div className="text-navy-400 text-sm text-center py-6">ยังไม่มีรายการ — เลือกประเภทและกรอกตัวเลขทางซ้าย</div>}
          {slip.length > 0 && (
            <div className="mt-3 pt-3 border-t border-navy-700">
              <div className="text-[10px] text-navy-400 mb-1.5">สรุปตามประเภท ({slip.length} รายการ)</div>
              <div className="flex flex-wrap gap-1.5">
                {[...slip.reduce((m, i) => m.set(i.name, (m.get(i.name) || 0) + 1), new Map())].map(([name, n]) => (
                  <span key={name} className="text-[10px] px-2 py-0.5 rounded-full bg-navy-900 border border-navy-600 text-navy-300">{name} ×{n}</span>
                ))}
              </div>
            </div>
          )}
          </div>
          <div className="border-t border-navy-700 mt-4 pt-4 space-y-1.5 text-sm">
            <div className="flex justify-between text-navy-300"><span>ยอดแทงรวม</span><span className="text-white font-bold text-base sm:text-lg">{satang(totalSatang)} บาท</span></div>
            {slip.length > 0 && (
              <div className="flex justify-between text-navy-300"><span>รางวัลจำลองถ้าถูกทุกตัว (ไม่รวมทุน)</span><span className="text-green-400 font-bold">{satang(totalPotential)} บาท</span></div>
            )}
            <div className="flex justify-between text-navy-300"><span>เครดิตคงเหลือ (หลังแทง)</span><span className="text-gold-300">{satang(balance - totalSatang)} บาท</span></div>
          </div>
          <p className="mt-3 text-[10px] text-navy-500 text-center leading-relaxed">
            📌 หากรอบหวยถูกยกเลิก ระบบคืนเครดิตเต็มจำนวนอัตโนมัติ • ยกเลิกโพยเองได้ก่อนปิดรับ •เครดิตเพื่อการศึกษา</p>
          <Button onClick={() => setConfirming(true)} disabled={!slip.length || busy || closed || totalSatang > balance}
            className="mt-4 w-full !py-3 sm:!py-3.5 text-sm sm:text-base font-bold">
            ตรวจสอบและยืนยันโพย
          </Button>
          {!user && <div className="text-center text-sm text-navy-300 mt-2"><Link to="/login" className="text-gold-400">เข้าสู่ระบบ</Link> เพื่อแทง</div>}
        </div>
      </div>

      {/* floating bet bar — มือถือ/แท็บเล็ต (slip panel อยู่ล่างจอ) */}
      {!closed && slip.length > 0 && !done && (
        <div className="sm:hidden fixed bottom-16 inset-x-0 z-30 px-3">
          <button onClick={() => setConfirming(true)} disabled={busy || totalSatang > balance}
            className="w-full bg-gradient-to-r from-gold-500 to-gold-600 text-navy-950 font-bold py-3 rounded-xl shadow-lg shadow-black/40 flex items-center justify-between gap-2 px-4 disabled:opacity-50">
            <span className="text-xs sm:text-sm min-w-0 truncate">🧾 {slip.length} รายการ • {satang(totalSatang)} บาท</span>
            <span className="text-xs sm:text-sm shrink-0">ตรวจสอบโพย →</span>
          </button>
        </div>
      )}

      {/* confirm modal — order ticket สไตล์กระดาษ */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4" onClick={() => !busy && setConfirming(false)}>
          <div className="w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-3">
              <h2 className="text-base sm:text-lg font-bold text-white">{headBar}ยืนยันโพยหวย</h2>
              <p className="text-xs sm:text-sm text-navy-300">{drawLabel(draw)}</p>
            </div>
            <div className="paper-slip rounded-lg px-5 py-5 pt-6 pb-7">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold tracking-widest text-[#8a7a5c] uppercase">ใบโพยแทงหวย</span>
                <span className="text-[10px] text-[#8a7a5c]">ใบเสร็จรับโพย</span>
              </div>
              <div className="paper-dash mb-3" />
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {slip.map((i, idx) => (
                  <div key={idx} className="flex justify-between items-baseline text-sm rounded px-2 py-1.5 bg-[#fbf3df]/70">
                    <span className="min-w-0">
                      <span className="text-[#8a7a5c] font-mono text-[11px] mr-1.5">{String(idx + 1).padStart(2, '0')}.</span>
                      <span className="paper-num text-[#8a5a00] text-base">{i.number}</span>
                      <span className="text-[#6b5636] text-xs ml-2">{i.name}</span>
                      {i.isAnn && <span className="ml-1 text-[9px] font-bold px-1 py-0.5 rounded bg-amber-600/20 border border-amber-700/50 text-amber-800">อั้น</span>}
                      {i.isTod && <span className="ml-1 text-[9px] font-bold px-1 py-0.5 rounded bg-sky-700/15 border border-sky-700/40 text-sky-800">โต๊ด</span>}
                    </span>
                    <span className="paper-num text-[#2b2118] shrink-0 ml-2">{satang(i.stakeSatang)}</span>
                  </div>
                ))}
              </div>
              <div className="paper-dash my-3" />
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-[#6b5636]">ยอดแทงรวม ({slip.length} รายการ)</span><span className="paper-num text-[#2b2118] text-base">{satang(totalSatang)} บาท</span></div>
                <div className="flex justify-between"><span className="text-[#6b5636]">รางวัลจำลองถ้าถูกทุกตัว (ไม่รวมทุน)</span><span className="paper-num text-[#1e7d46]">{satang(totalPotential)} บาท</span></div>
                <div className="flex justify-between"><span className="text-[#6b5636]">เครดิตคงเหลือหลังแทง</span><span className="paper-num text-[#8a5a00]">{satang(balance - totalSatang)} บาท</span></div>
              </div>
              <div className="paper-dash mt-3" />
              <div className="text-center text-[10px] text-[#8a7a5c] mt-2.5 leading-relaxed">
                📌 ยกเลิกโพยได้ก่อนเวลาปิดรับ • คืนเครดิตอัตโนมัติหากรอบถูกยกเลิก • เครดิตเสมือนเพื่อการศึกษา
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}
                className="flex-1 !py-2.5 sm:!py-3 text-sm sm:text-base backdrop-blur-sm">
                ← แก้ไขต่อ
              </Button>
              <Button onClick={submit} disabled={busy}
                className="flex-1 !py-2.5 sm:!py-3 text-sm sm:text-base shadow-lg shadow-gold-500/20">
                {busy ? 'กำลังส่ง...' : '✓ ยืนยันส่งโพย'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
