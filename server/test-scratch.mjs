import { genGrid, evaluateGrid } from './src/services/scratchService.js';
const cases = [
  ['🍒','🍒','🍒','🍋','🔔','⭐','💎','🍋','🔔'],
  ['🍒','🍋','🔔','⭐','💎','🍒','🍋','🔔','⭐'],
  ['💎','💎','💎','🍒','🍒','🍋','🔔','⭐','🍋'],
];
for (const g of cases) console.log(JSON.stringify(evaluateGrid(g)));

// distribution 20000 ใบ
const dist = {};
let expected = 0, wins = 0;
for (let i = 0; i < 20000; i++) {
  const g = genGrid(`test-${i}`);
  const o = evaluateGrid(g);
  const key = o.win ? o.symbol : 'lose';
  dist[key] = (dist[key] || 0) + 1;
  if (o.win) { wins++; expected += o.prize; }
}
console.log('dist:', dist, 'winRate:', (wins/20000*100).toFixed(1)+'%', 'avgPayout:', (expected/20000/100).toFixed(2), 'บาท → RTP', (expected/20000/5000*100).toFixed(1)+'%');
