// ยกเลิก draw ที่ settle ด้วยผลปลอม LA(dev-gen) — คืน stake ให้สมาชิก + ลบผลปลอม
// ใช้ครั้งเดียว: node scripts/cancel-ladam-devgen.mjs
import { getDb, tx } from '../server/src/db/index.js';
import { creditTx } from '../server/src/services/walletService.js';
import { audit } from '../server/src/lib/audit.js';
import { notify } from '../server/src/services/notifyService.js';

const db = getDb();
const draws = db.prepare(`
  SELECT d.id, d.draw_code, d.status FROM lottery_draws d
  JOIN lottery_results lr ON lr.draw_id = d.id
  JOIN lottery_types lt ON lt.id = d.lottery_type_id
  WHERE lt.code = 'LA' AND lr.source = 'LA(dev-gen)'`).all();

console.log(`พบ ${draws.length} รอบที่จะยกเลิก`);
let totalRefund = 0, totalSlips = 0;

for (const draw of draws) {
  const res = tx((d) => {
    // คืน stake ของทุก slip ที่ยังไม่ cancelled/refunded (รวม slip ที่ settle เป็น lost/won)
    const slips = d.prepare(`SELECT id, slip_ref, user_id, total_stake FROM bet_slips
                             WHERE draw_id = ? AND status NOT IN ('cancelled','refunded')`).all(draw.id);
    let refunded = 0, amount = 0;
    const perUser = new Map();
    for (const s of slips) {
      if (s.total_stake > 0) {
        creditTx(d, {
          userId: s.user_id, type: 'bet_refund', amount: s.total_stake,
          description: `คืนเครดิตโพย ${s.slip_ref} (ยกเลิกรอบหวยผลปลอม)`
          , idempotencyKey: `refund-cancel-${s.slip_ref}`,
        });
        const u = perUser.get(s.user_id) || { count: 0, amount: 0 };
        u.count++; u.amount += s.total_stake; perUser.set(s.user_id, u);
        refunded++; amount += s.total_stake;
      }
      d.prepare(`UPDATE bet_items SET status = 'cancelled' WHERE slip_id = ? AND status != 'cancelled'`).run(s.id);
      d.prepare(`UPDATE bet_slips SET status = 'refunded', settled_at = datetime('now') WHERE id = ?`).run(s.id);
    }
    d.prepare(`UPDATE lottery_draws SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`).run(draw.id);
    d.prepare(`DELETE FROM lottery_results WHERE draw_id = ?`).run(draw.id);
    for (const [uid, u] of perUser) {
      notify(uid, {
        type: 'refund',
        title: `คืนเครดิตจากรอบที่ยกเลิก (${u.count} โพย)`,
        body: `รอบ ${draw.draw_code} ถูกยกเลิก — คืนเครดิต ฿${(u.amount / 100).toLocaleString('th-TH')} เข้ากระเป๋าแล้ว`,
        link: '/my-bets',
      }, d);
    }
    return { refunded, amount };
  });
  audit({ action: 'draw.cancel_fake_result', entityType: 'draw', entityId: String(draw.id),
    detail: { drawCode: draw.draw_code, source: 'LA(dev-gen)', refundedSlips: res.refunded, refundedAmount: res.amount } });
  console.log(`${draw.draw_code}: refund ${res.refunded} slips ฿${(res.amount / 100).toFixed(2)}`);
  totalRefund += res.amount; totalSlips += res.refunded;
}
console.log(`เสร็จ — คืนเงินรวม ฿${(totalRefund / 100).toFixed(2)} (${totalSlips} โพย)`);
