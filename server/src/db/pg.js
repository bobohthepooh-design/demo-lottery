// PostgreSQL data layer — Step 1 ของ migration (ดู MIGRATION.md)
// Async-only: call sites ต้อง port เป็น async/await (Step 3)
// Auto-translate SQLite dialect → Postgres สำหรับ pattern ที่ใช้บ่อย
import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

// int8/bigint → node-pg คืน string โดย default — แปลงเป็น Number ให้ตรงกับ sqlite
// (ค่าเงินเป็นสตางค์ integer < 2^53 ปลอดภัย; NUMERIC/SUM ก็คืน string เหมือนกัน)
pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

let pool = null;

export function getPool() {
  if (!config.databaseUrl) throw new Error('DATABASE_URL ไม่ได้ตั้ง — Postgres mode ต้องใช้ connection string');
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: parseInt(process.env.PG_POOL_MAX || '10', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    pool.on('error', (e) => console.error('[pg] pool error:', e.message));
  }
  return pool;
}

export async function closePool() {
  if (pool) { await pool.end(); pool = null; }
}

/** แปลง SQLite SQL → Postgres dialect (best-effort สำหรับ pattern ที่ codebase ใช้) */
export function translate(sql) {
  let s = sql;
  // placeholders ? → $n  (นับเฉพาะ ? ที่ไม่อยู่ใน string literal — codebase ไม่มี ? ใน literal)
  let i = 0;
  s = s.replace(/\?/g, () => `$${++i}`);
  // datetime functions → TEXT รูปแบบเดียวกับ SQLite 'YYYY-MM-DD HH:MM:SS' UTC
  s = s.replace(/datetime\('now'\)/gi, "to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS')");
  s = s.replace(/datetime\('now',\s*'([+-]?\d+)\s+(minute|hour|day|month|year)s?'\)/gi,
    (m, n, unit) => `to_char((now() AT TIME ZONE 'UTC') ${n.startsWith('-') ? '-' : '+'} interval '${n.replace('-','')} ${unit}', 'YYYY-MM-DD HH:MM:SS')`);
  s = s.replace(/date\('now'\)/gi, "to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD')");
  // date('now','-6 days') → text date (คอลัมน์เป็น TEXT 'YYYY-MM-DD HH:MM:SS')
  s = s.replace(/date\('now',\s*'([+-]?\d+)\s+(minute|hour|day|month|year)s?'\)/gi,
    (m, n, unit) => `to_char((now() AT TIME ZONE 'UTC') ${n.startsWith('-') ? '-' : '+'} interval '${n.replace('-','')} ${unit}', 'YYYY-MM-DD')`);
  // date(<col>) → 'YYYY-MM-DD' (left 10 ตัวของ TEXT ISO)
  s = s.replace(/\bdate\(([a-zA-Z_][\w.]*)\)/g, 'left($1,10)');
  // strftime('%Y-%m-%d %H:%M:%S','now') → text now (pattern ที่ใช้ใน codebase)
  s = s.replace(/strftime\('%Y-%m-%d %H:%M:%S',\s*'now'\)/gi, "to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH:MM:SS')");
  s = s.replace(/strftime\('%Y-%m-%d',\s*'now'\)/gi, "to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD')");
  s = s.replace(/strftime\('%Y-%m',\s*'now'\)/gi, "to_char(now() AT TIME ZONE 'UTC','YYYY-MM')");
  // strftime(fmt, <col>) → to_char(col::timestamp, fmt) — รองรับ %Y-%m / %Y-%m-%d / %Y-%m-%d %H:%M:%S
  s = s.replace(/strftime\('%Y-%m-%d %H:%M:%S',\s*([a-zA-Z_][\w.]*)\)/gi, "to_char(($1)::timestamp,'YYYY-MM-DD HH24:MI:SS')");
  s = s.replace(/strftime\('%Y-%m-%d',\s*([a-zA-Z_][\w.]*)\)/gi, "to_char(($1)::timestamp,'YYYY-MM-DD')");
  s = s.replace(/strftime\('%Y-%m',\s*([a-zA-Z_][\w.]*)\)/gi, "to_char(($1)::timestamp,'YYYY-MM')");
  // INSERT OR IGNORE → ON CONFLICT DO NOTHING (ต่อท้าย statement)
  if (/^\s*INSERT\s+OR\s+IGNORE\s+INTO/i.test(s)) {
    s = s.replace(/^\s*INSERT\s+OR\s+IGNORE\s+INTO/i, 'INSERT INTO');
    s = s.replace(/;?\s*$/, ' ON CONFLICT DO NOTHING');
  }
  return s;
}

/** query → rows[] (SELECT) — ใช้กับ SELECT ทั้งหมด */
export async function q(text, params = []) {
  const r = await getPool().query(translate(text), params);
  return r.rows;
}

/** queryGet → row|null */
export async function qGet(text, params = []) {
  const rows = await q(text, params);
  return rows[0] || null;
}

/** queryRun → { changes } — สำหรับ INSERT/UPDATE/DELETE */
export async function qRun(text, params = []) {
  const r = await getPool().query(translate(text), params);
  return { changes: r.rowCount };
}

/** insert แล้วคืน id (เทียบเท่า lastInsertRowid) — ต่อ RETURNING id อัตโนมัติ */
export async function qInsert(text, params = []) {
  const t = translate(text);
  const needsReturning = !/\bRETURNING\b/i.test(t);
  const sql = needsReturning ? t.replace(/;?\s*$/, '') + ' RETURNING id' : t;
  const r = await getPool().query(sql, params);
  return { id: r.rows[0]?.id, changes: r.rowCount };
}

/**
 * transaction — เทียบเท่า tx() ของ sqlite แต่ async
 * ใช้ dedicated client เพื่อให้ BEGIN/COMMIT อยู่ connection เดียวกัน
 */
export async function pgTx(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* already rolled back */ }
    throw err;
  } finally {
    client.release();
  }
}

/** wrapper ให้ pg client มี API คล้าย db.prepare() สำหรับใช้ใน tx */
export function clientQ(client) {
  return {
    all: async (text, params = []) => (await client.query(translate(text), params)).rows,
    get: async (text, params = []) => (await client.query(translate(text), params)).rows[0] || null,
    run: async (text, params = []) => {
      const r = await client.query(translate(text), params);
      return { changes: r.rowCount };
    },
  };
}
