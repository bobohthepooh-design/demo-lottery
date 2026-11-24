// One-off ops: คืนเครดิตเฉพาะ bet_items ที่เป็น pending และอ้างอิง lottery_rules ที่ถูกปิดใช้ (is_active=0)
// จากการปฏิรูปประเภทการแทง — รายการบนกติกาใหม่คง pending ไว้ตามเดิม
// ใช้: DATABASE_URL=... node scripts/refund-inactive-rule-bets.mjs [--dry-run]
import { txAsync, closeDb } from '../src/db/index.js';
import { q } from '../src/db/pg.js';
import { creditTx } from '../src/services/walletService.js';
import { notify } from '../src/services/notifyService.js';
import { audit } from '../src/lib/audit.js';

const dryRun = process.argv.includes('--dry-run');

const slips = await q(`SELECT DISTINCT s.id, s.slip_ref, s.user_id, u.username
  FROM bet_slips s
  JOIN bet_items bi ON bi.slip_id = s.id AND bi.status = 'pending'
  JOIN lottery_rules lr ON lr.id = bi.rule_id AND lr.is_active = 0
  JOIN users u ON u.id = s.user_id
  WHERE s.status = 'pending'
  ORDER BY s.id`);

console.log(`${dryRun ? '[DRY-RUN] ' : ''}พบ ${slips.length} โพย pending ที่มีรายการบนกติกาที่ปิดใช้`);

for (const s of slips) {
  if (dryRun) {
    const items = await q(`SELECT bi.id, bi.bet_type, bi.number, bi.amount, lr.name_th
      FROM bet_items bi JOIN lottery_rules lr ON lr.id = bi.rule_id
      WHERE bi.slip_id = $1 AND bi.status = 'pending' AND lr.is_active = 0`, [s.id]);
    const total = items.reduce((a, i) => a + Number(i.amount), 0);
    console.log(`  slip ${s.id} (${s.slip_ref}) user=${s.username}: ${items.length} รายการ × ${total} satang`);
    items.forEach(i => console.log(`    - ${i.bet_type} ${i.number} ${i.amount} (${i.name_th})`));
    continue;
  }
  const result = await txAsync(async (d) => {
    const items = await d.prepare(`SELECT bi.id, bi.bet_type, bi.number, bi.amount, lr.name_th
      FROM bet_items bi JOIN lottery_rules lr ON lr.id = bi.rule_id
      WHERE bi.slip_id = ? AND bi.status = 'pending' AND lr.is_active = 0`).all(s.id);
    if (!items.length) return null;
    const refundAmount = items.reduce((a, i) => a + Number(i.amount), 0);
    const ph = items.map(() => '?').join(',');
    await d.prepare(`UPDATE bet_items SET status = 'cancelled' WHERE id IN (${ph})`).run(...items.map(i => i.id));
    const remaining = await d.prepare(`SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS n
      FROM bet_items WHERE slip_id = ? AND status != 'cancelled'`).get(s.id);
    if (Number(remaining.n) === 0) {
      await d.prepare(`UPDATE bet_slips SET status = 'cancelled', total_stake = 0 WHERE id = ? AND status = 'pending'`).run(s.id);
    } else {
      await d.prepare(`UPDATE bet_slips SET total_stake = ? WHERE id = ? AND status = 'pending'`).run(Number(remaining.total), s.id);
    }
    const tx = await creditTx(d, {
      userId: s.user_id, type: 'bet_refund', amount: refundAmount,
      description: `คืนเครดิตรายการโพย ${s.slip_ref} (ยกเลิกรายการประเภทการแทงที่ปิดใช้)`,
      idempotencyKey: `bet-refund-inactive-${s.slip_ref}`,
    });
    await notify(s.user_id, {
      type: 'refund', title: `คืนเครดิตโพย ${s.slip_ref}`,
      body: `ระบบคืนเครดิตรายการประเภทเก่า ฿${(refundAmount / 100).toLocaleString('th-TH')}`,
      link: '/my-bets',
    }, d);
    audit({ userId: s.user_id, action: 'bet.refund_inactive_rule', entityType: 'bet_slip', entityId: s.slip_ref,
      detail: { slipId: s.id, items: items.map(i => ({ id: i.id, betType: i.bet_type, number: i.number, amount: i.amount })), refundAmount, remainingItems: Number(remaining.n) } });
    return { slipId: s.id, slipRef: s.slip_ref, user: s.username, refundAmount, cancelledItems: items.length, remainingItems: Number(remaining.n), balanceAfter: tx.balanceAfter };
  });
  if (result) console.log(`  ✓ slip ${result.slipId} (${result.slipRef}) user=${result.user}: คืน ${result.refundAmount} satang, ยกเลิก ${result.cancelledItems} รายการ, เหลือ ${result.remainingItems} รายการ, balance=${result.balanceAfter}`);
}

await closeDb();
