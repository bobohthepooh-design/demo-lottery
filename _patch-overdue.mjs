import fs from 'node:fs';
const p = 'server/src/index.js';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  "import { maybeDailyCashback } from './services/promoService.js';",
  "import { maybeDailyCashback } from './services/promoService.js';\nimport { sendTelegram } from './services/telegramService.js';"
);
const anchor = '  const autoSettle = () => autoSettleResults()';
const fn = `  // แจ้งเตือน Telegram เมื่อมีรอบหวยค้างผล >2 ชม. — กันแอดมินไม่รู้ตัว
  let lastOverdueAlert = 0;
  const checkOverdue = async () => {
    try {
      const d = getDb();
      const rows = await d.prepare(\`SELECT d.draw_code, d.draw_at, lt.name_th AS type_name, c.name_th AS cat_name
        FROM lottery_draws d JOIN lottery_types lt ON lt.id = d.lottery_type_id
        LEFT JOIN lottery_categories c ON c.id = d.category_id
        WHERE d.status IN ('open','scheduled','closed')
          AND datetime(d.draw_at) <= datetime('now', '-2 hours')
          AND lt.code NOT IN ('SC','HL','KI','CF')
          AND d.id NOT IN (SELECT draw_id FROM lottery_results)
        ORDER BY d.draw_at LIMIT 10\`).all();
      if (!rows.length) return;
      const now = Date.now();
      if (now - lastOverdueAlert < 30 * 60 * 1000) return;
      lastOverdueAlert = now;
      const list = rows.map(r => \`• \${r.draw_code} (\${r.cat_name || r.type_name}) ออก \${r.draw_at}\`).join('\\n');
      await sendTelegram(\`🚨 หวยค้างผลเกิน 2 ชม. — \${rows.length} รอบ\\n\${list}\\n\\nตรวจสอบ: /admin/health\`);
      logger.warn('overdue-alert', rows.map(r => r.draw_code).join(', '));
    } catch (e) { console.error('[overdue-alert] failed:', e.message); }
  };
`;
if (!s.includes(anchor)) { console.log('anchor miss'); process.exit(1); }
s = s.replace(anchor, fn + anchor);
s = s.replace('    tickSeed();\n    autoSettle();', '    tickSeed();\n    autoSettle();\n    checkOverdue();');
fs.writeFileSync(p, s);
console.log('overdue alert wired');
