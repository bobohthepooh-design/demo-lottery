import Database from './server/node_modules/better-sqlite3/lib/index.js';
const db = new Database('server/data/demo-lottery.db', { readonly: true });
const rows = db.prepare('SELECT draw_id, result_json, published_at FROM lottery_results ORDER BY published_at DESC LIMIT 12').all();
for (const r of rows) {
  const d = db.prepare('SELECT lottery_type_id, name_th FROM lottery_draws WHERE id=?').get(r.draw_id);
  console.log(r.published_at, '|', d?.lottery_type_id, '|', r.result_json?.slice(0, 160));
}
