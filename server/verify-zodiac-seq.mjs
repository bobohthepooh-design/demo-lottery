import { getDb } from './src/db/index.js';
import { generateZodiacResult } from './src/services/resultFetcher.js';
import { evaluateBet, validateBetNumber } from './src/services/lotteryService.js';

const db = getDb();
const rules = db.prepare(`SELECT id, bet_type, name_th, digits, payout_multiplier, match_config, is_active
                          FROM lottery_rules WHERE lottery_type_id = (SELECT id FROM lottery_types WHERE code='HR')
                          ORDER BY id`).all();
console.log('HR rules:', rules.map(r => `${r.bet_type}(${r.digits}หลัก,x${r.payout_multiplier},active=${r.is_active})`).join(' | '));

const res = generateZodiacResult('HR-DEMO-TEST-99');
console.log('result:', JSON.stringify(res));
console.log('reproducible:', JSON.stringify(generateZodiacResult('HR-DEMO-TEST-99')) === JSON.stringify(res));
console.log('unique signs:', new Set(res.seq).size === 6);

const active = rules.filter(r => r.is_active === 1);
console.log('active:', active.map(r => r.bet_type).join(', '));
const [rBig, r3, r2, rRun] = active;
const seqStr = res.seq.join('-');
const tail3 = res.seq.slice(-3).join('-');
const tail2 = res.seq.slice(-2).join('-');
const head1 = res.seq[0];
const inSeq = res.seq[2];
const notInSeq = res.seq.includes(head1) ? 'มีน' : 'สิงห์';

const cases = [
  [rBig, head1, true, 'รางวัลใหญ่ตรง'],
  [r3, tail3, true, '3ราศีบนตรง'],
  [r3, res.seq.slice(-3).reverse().join('-'), false, '3ราศีบนสลับลำดับ'],
  [r2, tail2, true, '2ราศีล่างตรง'],
  [rRun, inSeq, true, 'วิ่งมีในผล'],
  [rRun, notInSeq, false, 'วิ่งไม่มีในผล'],
];
for (const [rule, num, expect, label] of cases) {
  const v = validateBetNumber(rule, num);
  const e = evaluateBet(rule, v, { zodiac: head1, seq: res.seq });
  console.log(`${label}: bet="${v}" win=${e.win} (คาด ${expect}) ${e.win === expect ? 'OK' : 'FAIL'}`);
}

// invalid inputs
for (const bad of [['', 'empty'], ['สิงห์-ปลาวาฬ', 'bad sign'], ['สิงห์-กันย์-ตุลย์-พิจิก', '4 signs for 3-rule']]) {
  try { validateBetNumber(r3, bad[0]); console.log(`reject "${bad[0]}": FAIL (accepted)`); }
  catch (e) { console.log(`reject "${bad[0]}" (${bad[1]}): OK`); }
}
process.exit(0);
