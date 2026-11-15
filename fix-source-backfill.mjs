import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('server/data/demo-lottery.db');
// ผลเก่าที่ source='auto' — แยกให้ชัด: หวยราศี/ลาวพัฒนา เป็น demo เสมอ
const r1 = db.prepare(`UPDATE lottery_results SET source='HR(gen)'
  WHERE source='auto' AND draw_id IN (SELECT d.id FROM lottery_draws d JOIN lottery_types t ON t.id=d.lottery_type_id WHERE t.code='HR')`).run();
const r2 = db.prepare(`UPDATE lottery_results SET source='LA(dev-gen)'
  WHERE source='auto' AND draw_id IN (SELECT d.id FROM lottery_draws d JOIN lottery_types t ON t.id=d.lottery_type_id JOIN lottery_categories c ON c.id=d.category_id WHERE t.code='LA' AND c.code != 'LA')`).run();
console.log('HR→demo:', r1.changes, '| LA-dev→demo:', r2.changes);
console.log(db.prepare(`SELECT source, COUNT(*) c FROM lottery_results GROUP BY source`).all());
