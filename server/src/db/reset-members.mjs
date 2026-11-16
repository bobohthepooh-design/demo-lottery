// รีเซ็ตสมาชิก DEMO: ลบสมาชิกทั้งหมด ยกเว้น admin และ test1 (test1 / 12345678)
// ใช้: npm run members:reset
import { getDb, txAsync, makeReference } from './index.js';
import { hashPassword } from '../lib/password.js';
import { register } from '../services/authService.js';
import { getSetting } from '../services/settingsService.js';
import { config } from '../config.js';

const KEEP_USERNAMES = new Set(['admin', 'test1']);
const TEST_PASSWORD = '12345678';

const db = getDb();

async function purgeUser(userId) {
  await txAsync(async (d) => {
    await d.prepare('DELETE FROM bet_slips WHERE user_id = ?').run(userId); // bet_items cascade ตาม
    await d.prepare('DELETE FROM virtual_transactions WHERE user_id = ?').run(userId);
    await d.prepare('UPDATE audit_logs SET user_id = NULL WHERE user_id = ?').run(userId);
    await d.prepare('UPDATE security_events SET user_id = NULL WHERE user_id = ?').run(userId);
    await d.prepare('UPDATE lottery_results SET published_by = NULL WHERE published_by = ?').run(userId);
    await d.prepare('UPDATE virtual_transactions SET created_by = NULL WHERE created_by = ?').run(userId);
    await d.prepare('UPDATE system_settings SET updated_by = NULL WHERE updated_by = ?').run(userId);
    // user_roles / user_sessions / virtual_wallets ถูกลบตามด้วย ON DELETE CASCADE
    await d.prepare('DELETE FROM users WHERE id = ?').run(userId);
  });
}

const users = await db.prepare('SELECT id, username FROM users').all();
const deleted = [];
for (const u of users) {
  if (KEEP_USERNAMES.has(u.username)) continue;
  await purgeUser(u.id);
  deleted.push(u.username);
}

// สร้าง/รีเซ็ต test1
let test1 = await db.prepare('SELECT * FROM users WHERE username = ?').get('test1');
if (!test1) {
  await register({ username: 'test1', email: 'test1@demo.local', password: TEST_PASSWORD, displayName: 'Test User 1' });
  console.log('created member: test1');
} else {
  await txAsync(async (d) => {
    await d.prepare(`UPDATE users SET password_hash = ?, status = 'active',
        updated_at = to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') WHERE id = ?`)
      .run(hashPassword(TEST_PASSWORD), test1.id);
    await d.prepare(`UPDATE user_sessions SET revoked_at = to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')
        WHERE user_id = ? AND revoked_at IS NULL`).run(test1.id);
    const role = await d.prepare(`SELECT id FROM roles WHERE name = 'member'`).get();
    if (role) {
      await d.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?) ON CONFLICT DO NOTHING').run(test1.id, role.id);
    }
    let wallet = await d.prepare('SELECT * FROM virtual_wallets WHERE user_id = ?').get(test1.id);
    if (!wallet) {
      const w = await d.prepare('INSERT INTO virtual_wallets (user_id, balance) VALUES (?, 0) RETURNING id').get(test1.id);
      const walletId = w.id;
      const initial = await getSetting('initial_credit', config.initialCredit);
      await d.prepare('UPDATE virtual_wallets SET balance = ?, version = version + 1 WHERE id = ?').run(initial, walletId);
      await d.prepare(`INSERT INTO virtual_transactions
        (reference, wallet_id, user_id, type, amount, balance_after, direction, status, idempotency_key, description)
        VALUES (?, ?, ?, 'initial_credit', ?, ?, 'credit', 'completed', ?, 'เครดิตเริ่มต้นสำหรับสมาชิกใหม่ (DEMO)')`)
        .run(makeReference('TX'), walletId, test1.id, initial, initial, `init-credit-${test1.id}`);
    }
  });
  console.log('reset member: test1');
}

const remaining = (await db.prepare('SELECT username FROM users ORDER BY id').all()).map(u => u.username);
console.log(`deleted ${deleted.length} user(s): ${deleted.join(', ') || '-'}`);
console.log(`remaining users: ${remaining.join(', ')}`);
process.exit(0);
