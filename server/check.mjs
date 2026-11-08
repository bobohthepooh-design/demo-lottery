import { getDb } from './src/db/index.js';
import { evaluateBet } from './src/services/lotteryService.js';

const db = getDb();
// TH rules
const th = db.prepare("SELECT * FROM lottery_rules WHERE lottery_type_id=1 AND is_active=1").all();
const wn = { first: '123456', front3: '123', top3: '456', bottom2: '56' };
const cases = [
  ['p1', '123456', true], ['p1', '123457', false],
  ['front3', '123', true], ['front3_tod', '321', true], ['front3_tod', '312', true], ['front3_tod', '123', true],
  ['top3', '456', true], ['top3_tod', '654', true],
  ['bottom2', '56', true], ['bottom2', '65', false],
  ['run_top', '4', true], ['run_top', '9', false], ['run_bottom', '5', true],
];
for (const [bt, num, exp] of cases) {
  const rule = th.find(r => r.bet_type === bt);
  const r = evaluateBet(rule, num, wn);
  console.log(`${r.win === exp ? 'PASS' : 'FAIL'} TH ${bt} ${num} -> ${r.win} (expect ${exp})`);
}
// LAD multi-prize
const lad = db.prepare("SELECT * FROM lottery_rules WHERE bet_type='last2' AND category_id=2").get();
const r1 = evaluateBet(lad, '12', { last2: ['12','34','56','78','90'] });
const r2 = evaluateBet(lad, '99', { last2: ['12','34','56','78','90'] });
console.log(`${r1.win ? 'PASS' : 'FAIL'} LAD last2 '12' in 5 prizes -> ${r1.win}`);
console.log(`${!r2.win ? 'PASS' : 'FAIL'} LAD last2 '99' not in prizes -> ${r2.win}`);
// HN
const hn = db.prepare("SELECT * FROM lottery_rules WHERE bet_type='num4' AND is_active=1 LIMIT 1").get();
console.log(`${evaluateBet(hn,'1234',{num4:'1234'}).win ? 'PASS' : 'FAIL'} HN num4 exact`);
