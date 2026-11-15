import { getDb } from './src/db/index.js';
const db = getDb();
console.log('=== ผลล่าสุด 15 รายการ ===');
const res = db.prepare(`SELECT d.draw_code, d.draw_at, d.status, lt.code tc, c.code cc, r.winning_numbers wn, r.source
                        FROM lottery_results r
                        JOIN lottery_draws d ON d.id=r.draw_id
                        JOIN lottery_types lt ON lt.id=d.lottery_type_id
                        LEFT JOIN lottery_categories c ON c.id=d.category_id
                        ORDER BY d.draw_at DESC LIMIT 15`).all();
for (const r of res) console.log(r.draw_at, '|', r.tc, r.cc||'', '|', r.draw_code, '|', r.status, '|', r.source, '|', String(r.wn).slice(0,80));
console.log('\n=== รอบที่เลยเวลาออกรางวัลแต่ยังไม่มีผล ===');
const now = new Date().toISOString().slice(0,19).replace('T',' ');
const pend = db.prepare(`SELECT d.draw_code, d.draw_at, d.status, lt.code tc, c.code cc
                         FROM lottery_draws d JOIN lottery_types lt ON lt.id=d.lottery_type_id
                         LEFT JOIN lottery_categories c ON c.id=d.category_id
                         WHERE d.draw_at <= ? AND d.status != 'cancelled'
                           AND d.id NOT IN (SELECT draw_id FROM lottery_results)
                         ORDER BY d.draw_at`).all(now);
for (const r of pend) console.log(r.draw_at, '|', r.tc, r.cc||'', '|', r.draw_code, '|', r.status);
console.log('now(UTC):', now);
process.exit(0);
