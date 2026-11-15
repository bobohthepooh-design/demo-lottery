import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('server/data/demo-lottery.db');
const rows = db.prepare(`
  WITH latest AS (
    SELECT lr.id, lr.draw_id, lr.published_at, lr.source,
           d.lottery_type_id AS tid, COALESCE(d.category_id, 0) AS cid,
           ROW_NUMBER() OVER (
             PARTITION BY d.lottery_type_id, COALESCE(d.category_id, 0)
             ORDER BY COALESCE(lr.published_at, d.draw_at) DESC, lr.id DESC
           ) AS rn
    FROM lottery_results lr
    JOIN lottery_draws d ON d.id = lr.draw_id
  )
  SELECT lt.id AS type_id, lt.code AS type_code, lt.name_th AS type_name_th,
         COALESCE(c.id, 0) AS cat_key, c.code AS cat_code, c.name_th AS cat_name_th,
         l.published_at, l.source, dr.draw_code
  FROM lottery_types lt
  LEFT JOIN lottery_categories c ON c.lottery_type_id = lt.id
  LEFT JOIN latest l ON l.tid = lt.id AND l.cid = COALESCE(c.id, 0) AND l.rn = 1
  LEFT JOIN lottery_draws dr ON dr.id = l.draw_id
  WHERE lt.is_active = 1 AND lt.code NOT IN ('SC','HL')
  ORDER BY lt.id, cat_key`).all();
console.log('rows:', rows.length);
rows.forEach(r => console.log(r.type_code, r.cat_code || '-', '|', r.type_name_th, r.cat_name_th || '', '|', r.published_at, '|', r.source, '|', r.draw_code));
