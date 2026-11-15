#!/usr/bin/env node
/**
 * sqlite-to-pg.mjs — copy ข้อมูลทั้งหมดจาก SQLite → PostgreSQL
 *
 * ใช้:
 *   DATABASE_URL=postgres://user:pass@host:5432/db node sqlite-to-pg.mjs [sqlitePath]
 *
 * - อ่าน server/data/demo-lottery.db (หรือ path ที่ระบุ)
 * - เขียนลง PG ตามลำดับ FK-safe, preserve id เดิม (OVERRIDING SYSTEM VALUE)
 * - idempotent-ish: ล้างเฉพาะตารางปลายทางก่อน (TRUNCATE ... CASCADE) —
 *   ⚠️ ข้อมูลใน PG จะถูกแทนที่ทั้งหมด ถ้าไม่ต้องการให้ใส่ --append
 * - หลังจบ reset identity sequences ให้ตรง MAX(id)
 */
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQLITE_PATH = process.argv[2] || path.join(__dirname, 'data', 'demo-lottery.db');
const PG_URL = process.env.DATABASE_URL;
if (!PG_URL) { console.error('ต้องตั้ง DATABASE_URL=postgres://...'); process.exit(1); }
const APPEND = process.argv.includes('--append');

// ลำดับ FK-safe: parent ก่อน child
const TABLES = [
  'roles', 'permissions',
  'role_permissions',
  'users',
  'user_roles',
  'lottery_types', 'lottery_categories', 'lottery_rules',
  'lottery_draws', 'lottery_results',
  'bet_slips', 'bet_items',
  'scratch_cards', 'hilo_tickets', 'kiwi_tickets',
  'virtual_wallets', 'virtual_transactions',
  'notifications',
  'chat_threads', 'chat_messages',
  'otp_codes', 'user_sessions', 'push_subscriptions',
  'system_settings', 'audit_logs', 'security_events',
  'schema_migrations',
];

const lite = new DatabaseSync(SQLITE_PATH);
const pool = new pg.Pool({ connectionString: PG_URL, max: 4 });

// ตารางที่มี identity column → ต้อง OVERRIDING SYSTEM VALUE เวลา insert id
const identityCols = new Map(); // table -> Set<col>
async function identityOf(client, table) {
  if (identityCols.has(table)) return identityCols.get(table);
  const r = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 AND is_identity='YES'`, [table]);
  const s = new Set(r.rows.map(x => x.column_name));
  identityCols.set(table, s);
  return s;
}

const client = await pool.connect();
try {
  await client.query('BEGIN');

  if (!APPEND) {
    // ล้างข้อมูลเดิมใน PG ทั้งหมด (เก็บ schema) — CASCADE จัดการ FK
    const existing = (await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname='public'`)).rows.map(r => r.tablename);
    const ours = existing.filter(t => TABLES.includes(t));
    if (ours.length) {
      await client.query(`TRUNCATE ${ours.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
      console.log(`[pg] truncated ${ours.length} tables`);
    }
  }

  let total = 0;
  for (const table of TABLES) {
    const cols = lite.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (!cols.length) { console.log(`[skip] ${table} (ไม่มีใน sqlite)`); continue; }
    const rows = lite.prepare(`SELECT ${cols.map(c => `"${c}"`).join(',')} FROM "${table}"`).all();
    if (!rows.length) { console.log(`[ok] ${table}: 0 rows`); total += 0; continue; }

    const ident = await identityOf(client, table);
    const colList = cols.map(c => `"${c}"`).join(', ');
    const overriding = ident.size ? ' OVERRIDING SYSTEM VALUE' : '';
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO "${table}" (${colList})${overriding} VALUES (${placeholders})`;

    let n = 0;
    for (const row of rows) {
      await client.query(sql, cols.map(c => row[c] ?? null));
      n++;
    }
    console.log(`[ok] ${table}: ${n} rows`);
    total += n;
  }

  // reset identity sequences → MAX(id) (กัน insert ถัดไปชน id เก่า)
  for (const table of TABLES) {
    const ident = await identityOf(client, table);
    if (!ident.has('id')) continue;
    await client.query(
      `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 1))`,
      [table]).catch(() => {});
  }

  await client.query('COMMIT');
  console.log(`[done] copied ${total} rows → ${PG_URL.replace(/\/\/.*@/, '//***@')}`);
} catch (e) {
  await client.query('ROLLBACK');
  console.error('[fail] rolled back:', e.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
  lite.close();
}
