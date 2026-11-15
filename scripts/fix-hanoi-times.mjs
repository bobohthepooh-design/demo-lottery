import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('server/data/demo-lottery.db');
db.exec(`UPDATE lottery_types SET description='หวยเวียดนาม ออกทุกวัน 4 รอบ: เฉพาะกิจ 16:30 • พิเศษ 17:30 • ปกติ 18:30 • VIP 19:30 น. (เวลาไทย)' WHERE code='HN'`);
const r = db.prepare(`UPDATE lottery_draws SET draw_at=datetime(draw_at,'+30 minutes'), close_at=datetime(close_at,'+30 minutes')
  WHERE draw_at > datetime('now')
    AND lottery_type_id = (SELECT id FROM lottery_types WHERE code='HN')
    AND status IN ('open','scheduled','closed')`).run();
console.log('shifted draws:', r.changes);
const rows = db.prepare(`SELECT d.draw_code, d.draw_at, d.close_at, d.status FROM lottery_draws d
  JOIN lottery_types t ON t.id = d.lottery_type_id WHERE t.code='HN' ORDER BY d.draw_at LIMIT 8`).all();
console.log(rows);
