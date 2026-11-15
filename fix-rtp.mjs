import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('server/data/demo-lottery.db');

// เป้าหมาย RTP ~65% — ค่าที่คำนวณจาก win-rate จริงใน sim-rtp.mjs
// [ltype, bet_type, newMult, newTod|null]
const FIX = [
  // 2 ตัว — exact+tod รวม ~65%
  ['TH', 'bottom2', 45, 20], ['LA', 'bottom2', 45, 20], ['LA', 'last2', 45, 20], ['HN', 'bottom2', 45, 20], ['HN', 'top2', 45, 20], ['LA', 'top2', 45, 20],
  // 3 ตัว ผลชุดเดียว (LA/HN) — exact ~0.1% + tod ~0.42%
  ['LA', 'last3', 400, 60], ['LA', 'top3', 400, 60], ['HN', 'top3', 400, 60],
  // 3 ตัว ผล 2 ชุด (TH front3/top3) — exact ~0.2% + tod ~0.83%
  ['TH', 'front3', 200, 30], ['TH', 'top3', 200, 30],
  // วิ่ง — digit_contains
  ['TH', 'run_bottom', 3.4, null], ['LA', 'run_bottom', 3.4, null], ['HN', 'run_bottom', 3.4, null],
  ['LA', 'run_top', 2.4, null], ['HN', 'run_top', 2.4, null], ['TH', 'run_top', 1.4, null], // TH top3 มี 2 ชุด = 6 หลัก
  // หวยราศี HR — คำนวณ analytic
  ['HR', 'zodiac', 8, null],          // 1/12 × 8 = 66.7%
  ['HR', 'zodiac_run', 1.3, null],    // 6/12 × 1.3 = 65%
  ['HR', 'zodiac2bottom', 85, null],  // 1/132 × 85 = 64.4%
  ['HR', 'zodiac3top', 850, null],    // 1/1320 × 850 = 64.4%
];

const upd = db.prepare(`UPDATE lottery_rules SET payout_multiplier = ?, match_config = ?
  WHERE is_active = 1 AND lottery_type_id = (SELECT id FROM lottery_types WHERE code = ?) AND bet_type = ?`);
let n = 0;
for (const [lt, bt, mult, tod] of FIX) {
  const rows = db.prepare(`SELECT id, match_config FROM lottery_rules
    WHERE is_active=1 AND lottery_type_id=(SELECT id FROM lottery_types WHERE code=?) AND bet_type=?`).all(lt, bt);
  for (const r of rows) {
    const cfg = JSON.parse(r.match_config);
    if (tod != null) cfg.tod = tod; else delete cfg.tod;
    upd.run(mult, JSON.stringify(cfg), lt, bt);
    n++;
    console.log(`${lt} ${bt}: x${mult}${tod != null ? ' tod=' + tod : ''} (rule ${r.id})`);
  }
}
console.log('updated', n, 'rules');
