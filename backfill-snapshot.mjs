import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('server/data/demo-lottery.db');
// โพยค้างต้อง settle ด้วยอัตรา ณ ตอนแทง (ก่อนปรับ RTP) — map ค่าเก่าตาม ltype+bet_type
const OLD = {
  'TH|bottom2': [90, 45], 'LA|bottom2': [90, 45], 'LA|last2': [90, 45],
  'HN|bottom2': [90, 45], 'HN|top2': [90, 45], 'LA|top2': [90, 45],
  'LA|last3': [900, 150], 'LA|top3': [900, 150], 'HN|top3': [850, 140],
  'TH|front3': [900, 150], 'TH|top3': [900, 150],
  'TH|run_bottom': [4.2, null], 'LA|run_bottom': [4.2, null], 'HN|run_bottom': [4.2, null],
  'LA|run_top': [3.2, null], 'HN|run_top': [3.2, null], 'TH|run_top': [3.2, null],
  'HR|zodiac': [11, null], 'HR|zodiac_run': [1.9, null], 'HR|zodiac2bottom': [110, null], 'HR|zodiac3top': [1000, null],
};
const pend = db.prepare(`SELECT bi.id, bi.rule_id, lt.code AS lt, r.bet_type, r.payout_multiplier AS cur_mult, r.match_config AS cur_cfg
  FROM bet_items bi JOIN bet_slips bs ON bs.id = bi.slip_id
  JOIN lottery_rules r ON r.id = bi.rule_id JOIN lottery_types lt ON lt.id = r.lottery_type_id
  WHERE bi.status = 'pending' AND bs.status = 'pending'`).all();
console.log('pending items:', pend.length);
const upd = db.prepare('UPDATE bet_items SET payout_multiplier = ?, match_config = ? WHERE id = ?');
let fixed = 0;
for (const it of pend) {
  const key = `${it.lt}|${it.bet_type}`;
  const old = OLD[key];
  if (!old) { // กติกาที่ไม่ได้ปรับ — snapshot = ค่าปัจจุบัน (ถูกต้องอยู่แล้ว)
    upd.run(it.cur_mult, it.cur_cfg, it.id); fixed++;
    continue;
  }
  const [mult, tod] = old;
  const cfg = JSON.parse(it.cur_cfg);
  if (tod != null) cfg.tod = tod; else delete cfg.tod;
  upd.run(mult, JSON.stringify(cfg), it.id); fixed++;
  console.log(`backfill ${key} rule=${it.rule_id} item=${it.id} -> x${mult} tod=${tod}`);
}
console.log('done', fixed);
