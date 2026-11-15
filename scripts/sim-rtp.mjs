import { DatabaseSync } from 'node:sqlite';
import { evaluateBet } from './server/src/services/lotteryService.js';
import { generateThaiResult, generateLaoDevResult, generateHanoiResult } from './server/src/services/resultFetcher.js';

const db = new DatabaseSync('server/data/demo-lottery.db');
const GEN = { TH: generateThaiResult, LA: generateLaoDevResult, HN: generateHanoiResult };
const N = 400000;

// pool ผลลัพธ์ 20k ชุด ใช้ซ้ำ
const pools = {};
for (const [t, gen] of Object.entries(GEN)) {
  pools[t] = [];
  for (let i = 0; i < 20000; i++) pools[t].push(gen(`SIM-${t}-${i}`).winning);
}

const rows = db.prepare(`SELECT lt.code AS ltype, r.bet_type, r.name_th, r.payout_multiplier, r.digits, r.match_config, r.id
  FROM lottery_rules r JOIN lottery_types lt ON lt.id = r.lottery_type_id
  WHERE r.is_active = 1 AND lt.code IN ('TH','LA','HN') ORDER BY lt.code, r.bet_type`).all();

const seen = new Set();
const rand = () => Math.floor(Math.random() * 10);
for (const r of rows) {
  const sig = `${r.ltype}|${r.bet_type}|${r.digits}|${r.payout_multiplier}|${r.match_config}`;
  if (seen.has(sig)) continue;
  seen.add(sig);
  const rule = { ...r, match_config: r.match_config };
  const pool = pools[r.ltype];
  let wins = 0, evSum = 0;
  const d = r.digits || 1;
  for (let i = 0; i < N; i++) {
    const w = pool[i % pool.length];
    const bet = Array.from({ length: d }, rand).join('');
    const ev = evaluateBet(rule, bet, w, {});
    if (ev.win) { wins++; evSum += Number(ev.multiplier) || 0; }
  }
  const rtp = evSum / N;
  console.log(`${r.ltype} ${r.bet_type} x${r.payout_multiplier} ${r.name_th}  win%=${(wins / N * 100).toFixed(3)}  RTP=${(rtp * 100).toFixed(1)}%`);
}
