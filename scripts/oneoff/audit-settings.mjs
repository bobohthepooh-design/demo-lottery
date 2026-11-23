import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('server/data/demo-lottery.db');
for (const t of ['app_settings','settings','site_settings']) {
  try {
    const rows = db.prepare(`SELECT * FROM ${t}`).all();
    console.log('==', t, rows.length);
    for (const r of rows) {
      const s = JSON.stringify(r);
      if (/hilo|scratch|instant|payout|mult/i.test(s)) console.log(s.slice(0, 300));
    }
  } catch { }
}
