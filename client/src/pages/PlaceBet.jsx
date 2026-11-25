import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation, Link, useSearchParams } from 'react-router-dom';
import { api, satang, bahtToSatang, fmtDateTime, drawLabel } from '../api.js';
import { useAuth } from '../auth.jsx';
import Countdown from '../components/Countdown.jsx';
import AnimatedNumber from '../components/AnimatedNumber.jsx';
import { FlagIcon } from '../components/ResultLine.jsx';
import { SkeletonCard } from '../components/Skeleton.jsx';
import { typeAccent } from '../typeAccent.js';
import { sfx } from '../sound.js';
import { kindBadge } from '../resultSource.js';
import { annSummary, annEntries } from '../ann.js';
import { bettingOpenAtSql, thaiHM } from '../bettingWindow.js';
import { Button } from '../components/ui/index.js';
import { X } from 'lucide-react';

const BET_TYPE_STYLE = {
  '2top': '2 ตัวบน', '2bottom': '2 ตัวล่าง', '3top': '3 ตัวบน', 'top4': '4 ตัวบน',
  '3tod': '3 ตัวโต๊ด', 'run_top': 'วิ่งบน', 'run_bottom': 'วิ่งล่าง',
  'ann_top': 'เลขอั้นบน', 'ann_bottom': 'เลขอั้นล่าง',
};

// เรียงประเภทการแทงตามลำดับที่คนทั่วไปคุ้นเคย
// ลำดับประเภทการแทง — เรียงตามจำนวนหลักมาก→น้อย (num5-num1 ของลาว/ฮานอย อยู่ในลำดับนี้ด้วย)
const BET_ORDER = ['first', 'top4', 'num4', 'last4', '3top', '3tod', 'front3', 'top3', 'last3', 'num3', '2top', 'bottom2', 'last2', 'num2', 'run_top', 'run_bottom', 'num1', 'last1', 'zodiac', 'zodiac3top', 'zodiac2bottom', 'zodiac_run'];

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
  [/run_top/, 'วิ่งบน — เลข 1 ตัวถูกถ้าอยู่ในเลข 3 ตัวบน'],
  [/run_bottom/, 'วิ่งล่าง — เลข 1 ตัวถูกถ้าอยู่ในเลข 2 ตัวล่าง'],
  [/3tod/, 'สามตัวโต๊ด — ถูกแม้สลับลำดับเลข (จ่ายเฉพาะอัตราโต๊ด)'],
  [/^first/, 'รางวัลที่ 1 — เลข 6 ตัวตรงเป๊ะ'],
  [/^num4|^last4/, 'สี่ตัวบน/เลขท้าย 4 ตัวตรงเป๊ะ'],
  [/^2top/, 'สองตัวบน — 2 ตัวท้ายของเลขบน'],
  [/^3top/, 'สามตัวบน — 3 ตัวท้ายของเลขบน'],
  [/^top4/, 'สี่ตัวบน — 4 ตัวท้ายของเลขบน'],
  [/^front3/, 'สามตัวหน้า — 3 ตัวหน้าของรางวัลที่ 1'],
  [/^top3/, 'สามตัวท้าย — เลขท้าย 3 ตัว'],
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
  const [searchParams] = useSearchParams();
  const showHidden = searchParams.get('showHidden') === '1';
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
  const [recent, setRecent] = useState({}); // {digits: [num,...]} เลขที่เพิ่งแทง
  const [favs, setFavs] = useState(() => { try { return JSON.parse(localStorage.getItem('lotteryFavNums') || '{}'); } catch { return {}; } });
  const numRef = useRef(null); // auto-focus ช่องเลขหลังเพิ่มโพย — แทงต่อได้เร็ว
  const [hoveredRule, setHoveredRule] = useState(null);
  const [hoveredPreset, setHoveredPreset] = useState(null);
  const [submitHover, setSubmitHover] = useState(false);

  // เปลี่ยนเนื้อหาโพย → key ใหม่ เพื่อไม่ให้โพยคนละชุดใช้ key เดียวกัน
  useEffect(() => { idemKey.current = null; }, [slip]);

  const loadDraw = () => api(`/lottery/draws/${drawId}`).then(async r => {
    setDraw(r.draw);
    try {
      const t = await api(`/lottery/draws/${drawId}/rules`);
      const sorted = [...t.rules].sort((a, b) =>
        (BET_ORDER.indexOf(a.bet_type) === -1 ? 99 : BET_ORDER.indexOf(a.bet_type)) -
        (BET_ORDER.indexOf(b.bet_type) === -1 ? 99 : BET_ORDER.indexOf(b.bet_type)) || b.digits - a.digits);
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

  const addRud = (kind) => {
    setErr('');
    if (!rule || rule.digits !== 2) return;
    const num = number.trim();
    if (!/^\d{2}$/.test(num)) return setErr('กรอกเลข 2 หลักก่อน แล้วกดปุ่มรูด');
    const { stake, err: amtErr } = stakeFromAmount();
    if (amtErr) return setErr(amtErr);
    const [a, b] = num.split('');
    let nums;
    if (kind === '19') {
      // รูด 19 ประตู = {a0..a9} ∪ {0b..9b} → 19 เลขพอดี (เลขกลับมีปุ่ม "กลับเลข" แยกอยู่)
      const set = new Set();
      for (let i = 0; i <= 9; i++) { set.add(a + i); set.add(i + b); }
      nums = [...set];
    } else if (kind === 'face') {
      // รูดหน้า = เลขหน้า (หลักสิบ) คงที่ → a0..a9 (10 เลข)
      nums = Array.from({ length: 10 }, (_, i) => a + i);
    } else {
      // รูดหลัง = เลขหลัง (หลักหน่วย) คงที่ → 0b..9b (10 เลข)
      nums = Array.from({ length: 10 }, (_, i) => i + b);
    }
    const label = kind === '19' ? 'รูด 19 ประตู' : kind === 'face' ? 'รูดหน้า' : 'รูดหลัง';
    const need = nums.length * stake;
    if (totalSatang + need > balance) {
      return setErr(`เครดิตไม่พอ — ${label} = ${nums.length} รายการ รวม ${satang(need)} บาท (คงเหลือ ${satang(balance - totalSatang)} บาท)`);
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
    if (d < 2) return setErr('เลขตอง/เบิ้ลใช้ได้กับประเภท 2-4 หลัก');
    if (kind === 'be' && d > 3) return setErr('เลขเบิ้ลใช้ได้กับประเภท 2-3 หลัก');
    const { stake, err: amtErr } = stakeFromAmount();
    if (amtErr) return setErr(amtErr);
    let nums;
    if (kind === 'tod') { // เลขตอง — ทุกหลักเป็นเลขเดียวกัน (10 เลข)
      nums = Array.from({ length: 10 }, (_, i) => String(i).repeat(d));
    } else if (kind === 'be' && d === 2) { // เลขเบิ้ล 2 หลัก — เลขซ้ำ 00,11,...,99 (10 เลข)
      nums = Array.from({ length: 10 }, (_, i) => String(i).repeat(2));
    } else { // เลขเบิ้ล 3 หลัก — มีตัวเลขซ้ำกัน 2 ตัว (เช่น 112/121/211)
      if (d !== 3) return setErr('เลขเบิ้ลใช้ได้กับประเภท 2-3 หลัก');
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
    <div style={{ maxWidth: '28rem', margin: '0 auto', background: 'var(--bg-card)', border: '1px solid var(--success-green)', borderRadius: '1.5rem', padding: '2rem', textAlign: 'center', boxShadow: 'var(--shadow-gold)' }}>
      <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🎉</div>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--success-green)' }}>ส่งโพยสำเร็จ!</h1>
      <p style={{ color: 'var(--muted-gray)', marginTop: '0.5rem' }}>เลขที่โพย: <code style={{ color: 'var(--gold-primary)' }}>{done.slipRef}</code></p>
      <p style={{ color: 'var(--muted-gray)' }}>ยอดแทงรวม {satang(done.totalStake)} บาท • ยอดเครดิตคงเหลือ {satang(done.balance)} บาท</p>
      <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
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
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-6">
      {/* left: entry form */}
      <div style={{}} className="lg:col-span-3 space-y-3 sm:space-y-4">
        {/* Header — Draw Info + Countdown */}
        <div style={{ background: 'linear-gradient(135deg, var(--bg-card), var(--bg-dark-surface))', border: '2px solid var(--border-gold)', borderRadius: 'var(--radius-2xl)', boxShadow: 'var(--shadow-gold-lg)' }} className="p-4 sm:p-6">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <Link to={showHidden ? '/play?showHidden=1' : '/play'} style={{ fontSize: '0.875rem', color: 'var(--gold-primary)', fontWeight: 600, transition: 'all 0.2s' }} className="hover:text-[var(--gold-bright)]">← เลือกตลาด/รอบอื่น</Link>
                <button
                  onClick={() => navigate(showHidden ? '/play' : '/play?showHidden=1')}
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '0.375rem 0.75rem',
                    borderRadius: '0.625rem',
                    border: '1px solid',
                    transition: 'all 0.2s',
                    background: showHidden ? 'var(--bg-dark-surface)' : 'rgba(34, 197, 94, 0.15)',
                    color: showHidden ? 'var(--muted-gray)' : 'var(--success-green)',
                    borderColor: showHidden ? 'var(--border-light)' : 'rgba(34, 197, 94, 0.3)'
                  }}
                  className="sm:text-xs sm:px-3 sm:py-2"
                >
                  {showHidden ? '🙈 ซ่อนรอบที่ยังไม่เปิด' : '👁️ แสดงรอบที่ซ่อนอยู่'}
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem 1rem' }} className="sm:gap-4">
                <FlagIcon code={draw.type_code} style={{ borderRadius: '0.375rem', boxShadow: 'var(--shadow-md)' }} className="w-10 h-7 sm:w-12 sm:h-9" />
                <div style={{ minWidth: 0 }}>
                  <h1 style={{ fontSize: '1.25rem', fontWeight: 900, color: ac?.text || 'var(--white)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '0.02em' }} className="sm:text-2xl">{drawLabel(draw)}</h1>
                  <div style={{ fontSize: '0.875rem', color: 'var(--muted-gray)', fontWeight: 500, marginTop: '0.25rem' }} className="sm:text-base">
                    {thaiDate(draw.draw_at)} • ปิดรับ {thaiHM(draw.close_at)} น.
                    <span style={{ color: 'var(--dark-gray)', fontSize: '0.75rem', marginLeft: '0.75rem', fontFamily: 'monospace', fontWeight: 600 }} className="sm:text-xs">{draw.draw_code}</span>
                  </div>
                </div>
              </div>
              {(() => { const s = annSummary(draw.announce); return s ? (
                <div style={{ marginTop: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem 0.75rem', fontSize: '0.75rem', fontWeight: 700, padding: '0.5rem 1.25rem', borderRadius: '0.75rem', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.5)', color: 'var(--warning-amber)', boxShadow: 'var(--shadow-sm)' }} className="sm:text-sm sm:px-5 sm:py-2.5">
                  📣 เลขอั้น: {s}
                </div>
              ) : null; })()}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem 0.75rem', flexShrink: 0 }} className="sm:gap-3">
              {kb && <span style={{ fontSize: '0.625rem', padding: '0.375rem 0.875rem', borderRadius: '9999px', fontWeight: 700, boxShadow: 'var(--shadow-sm)' }} className={`sm:text-xs sm:px-3 sm:py-1.5 ${kb.cls}`}>{kb.label}</span>}
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '0.375rem 1rem',
                borderRadius: '9999px',
                background: closed ? 'var(--bg-dark-surface)' : 'rgba(34, 197, 94, 0.15)',
                color: closed ? 'var(--muted-gray)' : 'var(--success-green)',
                border: closed ? '1px solid var(--border-light)' : '1px solid rgba(34, 197, 94, 0.3)',
                boxShadow: closed ? 'none' : 'var(--shadow-sm)'
              }} className="sm:text-sm sm:px-5 sm:py-2">
                {notYetOpen ? `⏳ เปิดรับ ${thaiHM(opensAt)} น.` : closed ? 'ปิดรับแล้ว' : '● รับแทงอยู่'}
              </span>
            </div>
          </div>
          {/* countdown — แถวเต็มความกว้างแยกจากหัวข้อ กันข้อความยาวดันชื่อรอบจนมองไม่เห็นบนมือถือ */}
          {!closed && (
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-gold)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--gold-primary)', fontWeight: 600 }} className="sm:text-base">เหลือเวลา</span>
              <span style={{ color: 'var(--gold-bright)', fontFamily: 'monospace', fontWeight: 800, fontSize: '1.125rem', textShadow: '0 0 20px rgba(212, 175, 55, 0.3)' }} className="sm:text-xl">
                <Countdown closeAt={draw.close_at} />
              </span>
            </div>
          )}
        </div>

        {!closed && (
          <div style={{ background: 'linear-gradient(135deg, var(--bg-card), var(--bg-dark-surface))', border: '2px solid var(--border-gold)', borderRadius: 'var(--radius-2xl)', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-gold-lg)' }} className="p-4 sm:p-7 gap-5 sm:gap-7">
            {/* Bet Type Selector — Grid layout, all visible */}
            <div>
              <h2 style={{ fontWeight: 800, color: 'var(--white)', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', letterSpacing: '0.01em' }}>
                <span style={{ width: '0.375rem', height: '1.75rem', background: 'linear-gradient(135deg, var(--gold-gradient-start), var(--gold-gradient-end))', borderRadius: '9999px', boxShadow: 'var(--shadow-gold)' }} />
                เลือกประเภทการแทง
              </h2>
              {rule && <div style={{ fontSize: '0.875rem', color: 'var(--gold-primary)', marginBottom: '1rem', marginLeft: '1.125rem', padding: '0.625rem 1rem', background: 'rgba(212, 175, 55, 0.08)', borderRadius: '0.75rem', border: '1px solid rgba(212, 175, 55, 0.2)', fontWeight: 500 }} className="sm:text-base">💡 {ruleHint(rule)}</div>}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                {rules.map(r => {
                  const isAnn = r.bet_type?.startsWith('ann_');
                  const isSel = selRule === String(r.id);
                  return (
                    <button key={r.id} onClick={() => setSelRule(String(r.id))}
                      onMouseEnter={() => setHoveredRule(r.id)}
                      onMouseLeave={() => setHoveredRule(null)}
                      className="p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl border-2 text-left transition-all duration-200"
                      style={{
                        border: '2px solid',
                        background: isSel ? 'linear-gradient(135deg, rgba(212, 175, 55, 0.2), rgba(212, 175, 55, 0.1))' : 'var(--bg-dark-surface)',
                        borderColor: isSel ? 'var(--border-gold)' : 'var(--border-light)',
                        color: isSel ? 'var(--gold-bright)' : 'var(--muted-gray)',
                        boxShadow: isSel ? 'var(--shadow-gold)' : 'none',
                        transform: hoveredRule === r.id ? 'translateY(-3px)' : 'translateY(0)'
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }} className="sm:text-base">
                          {isAnn && <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '0.25rem 0.5rem', borderRadius: '0.5rem', background: 'rgba(245, 158, 11, 0.2)', border: '1px solid rgba(245, 158, 11, 0.5)', color: 'var(--warning-amber)', flexShrink: 0 }} className="sm:text-xs">อั้น</span>}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name_th}</span>
                        </div>
                        <span style={{
                          fontSize: '0.75rem',
                          fontFamily: 'monospace',
                          fontWeight: 800,
                          padding: '0.25rem 0.5rem',
                          borderRadius: '0.5rem',
                          flexShrink: 0,
                          background: isSel ? 'linear-gradient(135deg, var(--gold-gradient-start), var(--gold-gradient-end))' : 'rgba(0, 0, 0, 0.3)',
                          color: isSel ? 'var(--bg-deep-black)' : 'var(--gold-primary)'
                        }} className="sm:text-sm">x{r.payout_multiplier}</span>
                      </div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--muted-gray)', lineHeight: 1.4, fontWeight: 500 }} className="sm:text-xs">
                        {r.bet_type === 'pattana5' ? 'เลือก 5 เลข 1-45' : r.bet_type?.startsWith('zodiac') ? (r.digits > 1 ? `${r.digits} ราศี` : '1 ราศี') : `${r.digits} หลัก`}
                        {isAnn && <span style={{ color: 'var(--warning-amber)', fontWeight: 600 }}> • ครึ่งรางวัล</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Number Input Area */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {isZodiac ? (
                <div style={{}} className="sm:col-span-2">
                  <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--muted-gray)', marginBottom: '0.5rem', display: 'block' }}>
                    เลือกปีนักษัตร {zodiacDigits > 1 ? `(เลือก ${zodiacDigits} ตัวตามลำดับ)` : '(1 ใน 12)'}
                  </label>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 sm:gap-2">
                    {ZODIAC.map(z => {
                      const idx = zodiacPicks.indexOf(z);
                      const sel = idx >= 0;
                      const full = !sel && zodiacPicks.length >= zodiacDigits;
                      return (
                        <button key={z} type="button" onClick={() => toggleZodiac(z)} disabled={full}
                          style={{
                            padding: '0.75rem',
                            borderRadius: '0.75rem',
                            border: '1px solid',
                            transition: 'all 0.2s',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '0.25rem',
                            background: sel ? 'var(--info-blue)' : 'var(--bg-dark-surface)',
                            borderColor: sel ? 'var(--info-blue)' : 'var(--border-light)',
                            color: sel ? 'var(--white)' : 'var(--muted-gray)',
                            fontWeight: 700,
                            boxShadow: sel ? '0 10px 15px -3px rgba(59, 130, 246, 0.2)' : 'none',
                            opacity: full ? 0.4 : 1
                          }}>
                          <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>{ZODIAC_EMOJI[z]}</span>
                          <span style={{ fontSize: '0.625rem', lineHeight: 1.25, color: sel ? 'var(--white)' : 'var(--muted-gray)' }}>{sel ? `${idx + 1}. ${z}` : z}</span>
                        </button>
                      );
                    })}
                  </div>
                  {zodiacPicks.length > 0 && (
                    <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', fontFamily: 'monospace', color: 'var(--info-blue)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem' }}>
                      ผล: {zodiacPicks.map((z, i) => (
                        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          {i > 0 && <span style={{ color: 'var(--dark-gray)' }}>→</span>}
                          <span style={{ fontSize: '1.125rem', lineHeight: 1 }}>{ZODIAC_EMOJI[z]}</span>{z}
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ marginTop: '0.75rem', borderRadius: '0.5rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '1rem', fontSize: '0.75rem', color: 'var(--muted-gray)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ fontWeight: 600, color: 'var(--info-blue)' }}>📖 ผลรางวัล = ปีนักษัตร 6 ตัวไม่ซ้ำ เรียงลำดับ</div>
                    <div>เช่น <span style={{ fontFamily: 'monospace', color: 'var(--gold-primary)' }}>ขาล-เถาะ-มะโรง-มะเส็ง-มะเมีย-มะแม</span></div>
                    <div>① ตัวแรก = รางวัลใหญ่ • ④⑤⑥ สามตัวท้าย = 3 บน • ⑤⑥ สองตัวท้าย = 2 ล่าง • ปีนักษัตรไหนก็ได้ = วิ่ง</div>
                    {rule?.bet_type && ZODIAC_HINT[rule.bet_type] && (
                      <div style={{ color: 'var(--info-blue)', fontWeight: 500 }}>→ {ZODIAC_HINT[rule.bet_type]}</div>
                    )}
                  </div>
                </div>
              ) : isPattana ? (
                <div style={{}} className="sm:col-span-2">
                  <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--muted-gray)', marginBottom: '0.5rem', display: 'block' }}>
                    เลือกเลข 5 ตัวจาก 1-45 (เลือกแล้ว {picks.length}/5)
                  </label>
                  <div className="grid grid-cols-6 sm:grid-cols-9 md:grid-cols-[repeat(15,minmax(0,1fr))] gap-1.5 sm:gap-2">
                    {Array.from({ length: 45 }, (_, i) => i + 1).map(n => (
                      <button key={n} type="button" onClick={() => togglePick(n)}
                        style={{
                          padding: '0.625rem',
                          borderRadius: '0.5rem',
                          fontSize: '0.875rem',
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          border: '1px solid',
                          transition: 'all 0.2s',
                          background: picks.includes(n) ? 'var(--gold-primary)' : 'var(--bg-dark-surface)',
                          borderColor: picks.includes(n) ? 'var(--gold-primary)' : 'var(--border-light)',
                          color: picks.includes(n) ? 'var(--bg-deep-black)' : 'var(--muted-gray)',
                          boxShadow: picks.includes(n) ? 'var(--shadow-gold)' : 'none'
                        }}>
                        {n}
                      </button>
                    ))}
                  </div>
                  {picks.length > 0 && (
                    <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', fontFamily: 'monospace', color: 'var(--gold-primary)', background: 'rgba(212, 175, 55, 0.1)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem' }}>
                      เลือก: {[...picks].sort((a,b)=>a-b).map(n=>String(n).padStart(2,'0')).join('-')}
                    </div>
                  )}
                </div>
              ) : !rule ? (
                <div className="sm:col-span-2" style={{ color: 'var(--muted-gray)', fontSize: '0.875rem', padding: '2rem 0', textAlign: 'center' }}>กำลังโหลดประเภทการแทง...</div>
              ) : (
                <>
                  {/* Quick Actions */}
                  <div style={{}} className="sm:col-span-2">
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', background: 'linear-gradient(135deg, var(--bg-dark-surface), var(--bg-card))', borderRadius: '1rem', border: '2px solid var(--border-gold)', boxShadow: 'var(--shadow-md)' }} className="gap-2.5 sm:gap-2 px-4 py-3 sm:px-5 sm:py-3">
                      <span style={{ fontSize: '0.875rem', color: 'var(--gold-primary)', fontWeight: 700, letterSpacing: '0.02em' }} className="sm:text-base">ปุ่มลัด:</span>
                      <button type="button" onClick={() => setNumber(randNum(rule.digits))}
                        style={{ fontSize: '0.8125rem', padding: '0.5rem 0.875rem', borderRadius: '0.625rem', background: 'linear-gradient(135deg, var(--gold-gradient-start), var(--gold-gradient-end))', border: 'none', color: 'var(--bg-deep-black)', fontWeight: 700, transition: 'all 0.2s', boxShadow: 'var(--shadow-gold)' }} className="sm:text-xs hover:shadow-[var(--shadow-gold-lg)] hover:-translate-y-0.5">
                        🎲 สุ่มเลข
                      </button>
                      <button type="button" disabled={number.length < 2}
                        onClick={() => setNumber(number.split('').reverse().join(''))}
                        style={{ fontSize: '0.8125rem', padding: '0.5rem 0.875rem', borderRadius: '0.625rem', background: 'var(--bg-dark-surface)', border: '2px solid var(--border-light)', color: 'var(--muted-gray)', transition: 'all 0.2s', opacity: number.length < 2 ? 0.4 : 1, fontWeight: 600 }} className="sm:text-xs hover:border-[var(--border-gold)] hover:text-[var(--gold-primary)]">
                        🔁 กลับเลข
                      </button>
                      {rule.digits === 2 && !rule.bet_type?.startsWith('ann_') && (
                        <>
                          <button type="button" onClick={() => addRud('19')}
                            style={{ fontSize: '0.8125rem', padding: '0.5rem 0.875rem', borderRadius: '0.625rem', background: 'rgba(212, 175, 55, 0.15)', border: '2px solid var(--border-gold)', color: 'var(--gold-primary)', fontWeight: 700, transition: 'all 0.2s' }} className="sm:text-xs hover:bg-[rgba(212,175,55,0.25)] hover:shadow-[var(--shadow-gold)]">
                            🎯 รูด 19 ประตู
                          </button>
                          <button type="button" onClick={() => addRud('face')}
                            style={{ fontSize: '0.8125rem', padding: '0.5rem 0.875rem', borderRadius: '0.625rem', background: 'var(--bg-dark-surface)', border: '2px solid var(--border-light)', color: 'var(--muted-gray)', transition: 'all 0.2s', fontWeight: 600 }} className="sm:text-xs hover:border-[var(--border-gold)] hover:text-[var(--gold-primary)]">
                            👈 รูดหน้า
                          </button>
                          <button type="button" onClick={() => addRud('back')}
                            style={{ fontSize: '0.8125rem', padding: '0.5rem 0.875rem', borderRadius: '0.625rem', background: 'var(--bg-dark-surface)', border: '2px solid var(--border-light)', color: 'var(--muted-gray)', transition: 'all 0.2s', fontWeight: 600 }} className="sm:text-xs hover:border-[var(--border-gold)] hover:text-[var(--gold-primary)]">
                            👉 รูดหลัง
                          </button>
                        </>
                      )}
                      {rule.digits >= 2 && (
                        <>
                          <button type="button" onClick={() => addPattern('tod')}
                            style={{ fontSize: '0.8125rem', padding: '0.5rem 0.875rem', borderRadius: '0.625rem', background: 'var(--bg-dark-surface)', border: '2px solid var(--border-light)', color: 'var(--muted-gray)', transition: 'all 0.2s', fontWeight: 600 }} className="sm:text-xs hover:border-[var(--border-gold)] hover:text-[var(--gold-primary)]">
                            🔢 เลขตอง
                          </button>
                          {rule.digits <= 3 && (
                            <button type="button" onClick={() => addPattern('be')}
                              style={{ fontSize: '0.8125rem', padding: '0.5rem 0.875rem', borderRadius: '0.625rem', background: 'var(--bg-dark-surface)', border: '2px solid var(--border-light)', color: 'var(--muted-gray)', transition: 'all 0.2s', fontWeight: 600 }} className="sm:text-xs hover:border-[var(--border-gold)] hover:text-[var(--gold-primary)]">
                              🔢 เลขเบิ้ล
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Number Input */}
                  <div>
                    <label style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--gold-primary)', marginBottom: '0.75rem', display: 'block', letterSpacing: '0.02em' }} className="sm:text-base">หมายเลข ({rule?.digits || '?'} หลัก)</label>
                    <input ref={numRef} value={number} onChange={e => setNumber(e.target.value.replace(/\D/g,'').slice(0, rule?.digits || 3))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
                      inputMode="numeric" placeholder={rule ? '0'.repeat(rule.digits) : ''}
                      style={{
                        width: '100%',
                        background: 'var(--bg-dark-surface)',
                        border: '2px solid var(--border-light)',
                        borderRadius: '1rem',
                        padding: '1rem 1.25rem',
                        fontSize: '1.75rem',
                        letterSpacing: '0.35em',
                        textAlign: 'center',
                        color: 'var(--gold-primary)',
                        fontFamily: 'monospace',
                        fontWeight: 800,
                        outline: 'none',
                        transition: 'all 0.2s'
                      }} className="sm:px-5 sm:py-5 sm:text-4xl sm:tracking-[0.5em] focus:border-[var(--border-gold)] focus:shadow-[0_0_0_4px_rgba(212,175,55,0.15)]" />
                    {favKey > 0 && (
                      <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
                        {favList.map(f => (
                          <button key={f} type="button" onClick={() => pickFav(f)}
                            style={{ fontSize: '0.875rem', padding: '0.5rem 0.875rem', borderRadius: '0.625rem', background: 'var(--bg-dark-surface)', border: '2px solid var(--border-gold)', color: 'var(--gold-primary)', fontFamily: 'monospace', transition: 'all 0.2s', fontWeight: 600 }} className="hover:bg-[rgba(212,175,55,0.1)]">{f}</button>
                        ))}
                        {favList.length === 0 && recentList.length === 0 && <span style={{ fontSize: '0.75rem', color: 'var(--dark-gray)' }}>เลขโปรดที่บันทึกไว้จะแสดงที่นี่</span>}
                        {new RegExp(`^\\d{${favKey}}$`).test(number) && !favList.includes(number) && (
                          <button type="button" onClick={() => saveFav(number)}
                            style={{ fontSize: '0.75rem', padding: '0.375rem 0.75rem', borderRadius: '0.625rem', border: '2px solid var(--border-light)', color: 'var(--muted-gray)', transition: 'all 0.2s', fontWeight: 600 }} className="hover:border-[var(--border-gold)] hover:text-[var(--gold-primary)]">⭐ บันทึกเลขนี้</button>
                        )}
                      </div>
                    )}
                    {favKey > 0 && recentList.length > 0 && (
                      <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.375rem' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--dark-gray)', fontWeight: 600 }}>เพิ่งแทง:</span>
                        {recentList.map(f => (
                          <button key={f} type="button" onClick={() => pickFav(f)}
                            style={{ fontSize: '0.75rem', padding: '0.375rem 0.75rem', borderRadius: '0.625rem', background: 'var(--bg-dark-surface)', border: '2px solid var(--border-light)', color: 'var(--muted-gray)', fontFamily: 'monospace', transition: 'all 0.2s', fontWeight: 600 }} className="hover:border-[var(--border-gold)] hover:text-[var(--gold-primary)]">{f}</button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Amount Input */}
                  <div>
                    <label style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--gold-primary)', marginBottom: '0.75rem', display: 'block', letterSpacing: '0.02em' }} className="sm:text-base">จำนวนเงิน (บาท)</label>
                    <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g,''))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
                      inputMode="decimal" placeholder="0.00"
                      style={{
                        width: '100%',
                        background: 'var(--bg-dark-surface)',
                        border: '2px solid var(--border-light)',
                        borderRadius: '1rem',
                        padding: '1rem 1.25rem',
                        fontSize: '1.75rem',
                        textAlign: 'center',
                        color: 'var(--gold-primary)',
                        fontFamily: 'monospace',
                        fontWeight: 800,
                        outline: 'none',
                        transition: 'all 0.2s'
                      }} className="sm:px-5 sm:py-5 sm:text-3xl focus:border-[var(--border-gold)] focus:shadow-[0_0_0_4px_rgba(212,175,55,0.15)]" />
                    <div className="grid grid-cols-4 gap-2 sm:gap-3 mt-3">
                      {[1, 5, 10, 20, 50, 100, 200, 500].map(v => (
                        <button key={v} type="button" onClick={() => setAmount(String(v))}
                          onMouseEnter={() => setHoveredPreset(v)}
                          onMouseLeave={() => setHoveredPreset(null)}
                          style={{
                            fontSize: '0.875rem',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '0.625rem',
                            border: '2px solid',
                            fontWeight: 700,
                            transition: 'all 0.2s',
                            background: Number(amount) === v ? 'rgba(212, 175, 55, 0.2)' : 'var(--bg-dark-surface)',
                            borderColor: Number(amount) === v ? 'var(--border-gold)' : 'var(--border-light)',
                            color: Number(amount) === v ? 'var(--gold-primary)' : 'var(--muted-gray)',
                            transform: hoveredPreset === v ? 'translateY(-2px)' : 'translateY(0)'
                          }} className="sm:text-sm sm:py-2.5 sm:px-1 hover:border-[var(--border-gold)] hover:text-[var(--gold-primary)]">
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {err && <div style={{ color: 'var(--danger-red)', fontSize: '0.75rem', fontWeight: 500, background: 'rgba(239, 68, 68, 0.1)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem' }} className="sm:text-sm">{err}</div>}
          <Button onClick={addItem} variant="secondary" className="w-full !py-3 sm:!py-4 text-base sm:text-lg font-bold hover:border-[var(--border-gold-hover)] hover:text-[var(--gold-bright)] hover:bg-[rgba(212,175,55,0.08)]"
            style={{ border: '2px solid var(--border-gold)', color: 'var(--gold-primary)', background: 'var(--bg-dark-surface)' }}>
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
                  <button onClick={() => setSlip(slip.filter((_, j) => j !== idx))} aria-label="ลบรายการ" className="text-red-400 hover:text-gold-300 text-sm sm:text-base inline-flex items-center justify-center" style={{ minWidth: '28px', minHeight: '28px' }}><X size={16} strokeWidth={2.5} /></button>
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
            <div className="flex justify-between text-navy-300"><span>ยอดแทงรวม</span><span className="text-white font-bold text-base sm:text-lg"><AnimatedNumber value={totalSatang} /> บาท</span></div>
            {slip.length > 0 && (
              <div className="flex justify-between text-navy-300"><span>รางวัลจำลองถ้าถูกทุกตัว (ไม่รวมทุน)</span><span className="text-green-400 font-bold"><AnimatedNumber value={totalPotential} /> บาท</span></div>
            )}
            <div className="flex justify-between text-navy-300"><span>เครดิตคงเหลือ (หลังแทง)</span><span className="text-gold-300"><AnimatedNumber value={balance - totalSatang} /> บาท</span></div>
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
            style={{
              width: '100%',
              background: 'linear-gradient(90deg, var(--gold-gradient-start), var(--gold-gradient-end))',
              color: 'var(--bg-deep-black)',
              fontWeight: 700,
              padding: '0.75rem',
              borderRadius: '0.75rem',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem',
              opacity: busy || totalSatang > balance ? 0.5 : 1
            }}>
            <span style={{ fontSize: '0.75rem', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🧾 {slip.length} รายการ • {satang(totalSatang)} บาท</span>
            <span style={{ fontSize: '0.75rem', flexShrink: 0 }}>ตรวจสอบโพย →</span>
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
