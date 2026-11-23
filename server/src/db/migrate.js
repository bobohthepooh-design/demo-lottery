import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool } from './pg.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations');
const schemaPgFile = path.join(__dirname, 'schema.pg.sql');

const migrationFiles = () => fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort()
  .map(f => ({ version: parseInt(f.split('_')[0], 10), name: f }));

/**
 * PostgreSQL mode — migrations/*.sql เป็น SQLite dialect รันตรงๆ ไม่ได้
 * ใช้ schema.pg.sql (schema เต็ม) แทน: apply ครั้งเดียวถ้ายังไม่มีตาราง users
 * แล้ว mark ทุก migration version ว่า applied เพื่อให้ตรวจสอบสถานะได้
 */
export async function migrate() {
  const pool = getPool();
  // advisory lock ระดับ session — กันหลาย process/worker migrate พร้อมกัน
  // (test files รันขนานบน DB เดียวกันเจอ race ที่ schema.pg.sql / INSERT version)
  // ต้องใช้ client เดียวตลอด เพราะ pg_advisory_lock ผูกกับ session ไม่ใช่ pool
  const client = await pool.connect();
  const MIGRATE_LOCK = 727001;
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATE_LOCK]);
    await migrateLocked(client);
  } finally {
    try { await client.query('SELECT pg_advisory_unlock($1)', [MIGRATE_LOCK]); } catch {}
    client.release();
  }
}

async function migrateLocked(client) {
  const pool = { query: (...a) => client.query(...a) }; // compat shim
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS'))
  )`);
  // schema_migrations เวอร์ชันเก่า (test artifact) อาจไม่มี column name — เติมให้
  await pool.query(`ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS name TEXT`);

  const exists = await pool.query(`SELECT to_regclass('public.users') IS NOT NULL AS ok`);
  if (!exists.rows[0].ok) {
    const sql = fs.readFileSync(schemaPgFile, 'utf8');
    await pool.query(sql); // มี BEGIN...COMMIT ในตัวไฟล์
    console.log('[migrate] applied schema.pg.sql');
  }

  const applied = new Set(
    (await pool.query('SELECT version FROM schema_migrations')).rows.map(r => Number(r.version))
  );
  for (const { version, name } of migrationFiles()) {
    if (applied.has(version)) continue;
    await pool.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [version, name]);
    console.log(`[migrate] marked ${name}`);
  }
  console.log('[migrate] up to date');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate().catch(e => { console.error(e.message); process.exit(1); });
}
