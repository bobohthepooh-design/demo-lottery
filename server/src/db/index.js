import { config } from '../config.js';
import { getPool, translate, closePool } from './pg.js';

let db = null;

// ---------- PostgreSQL facade ----------
// pg mode: prepare() คืน stmt ที่ get/all/run เป็น async — caller ที่ port แล้วใช้ `await`
// (await ค่าธรรมดาใน sqlite mode ก็ใช้ได้ปกติ)
// ตารางที่ไม่มีคอลัมน์ id (PK เป็น composite/key อื่น) — ห้ามต่อ RETURNING id
const NO_ID_TABLES = new Set(['role_permissions', 'user_roles', 'system_settings', 'schema_migrations']);

function pgPrepare(pool, sql) {
  let t = translate(sql);
  const isInsert = /^\s*INSERT\s/i.test(t) && !/\bRETURNING\b/i.test(t);
  const tableMatch = t.match(/^\s*INSERT\s+INTO\s+(?:"?\w+"?\.)?"?(\w+)"?/i);
  const hasIdCol = tableMatch && !NO_ID_TABLES.has(tableMatch[1].toLowerCase());
  if (isInsert && hasIdCol) t = t.replace(/;?\s*$/, '') + ' RETURNING id';
  return {
    get: async (...params) => (await pool.query(t, params)).rows[0] || null,
    all: async (...params) => (await pool.query(t, params)).rows,
    run: async (...params) => {
      const r = await pool.query(t, params);
      const row = r.rows[0];
      return { changes: r.rowCount, lastInsertRowid: row?.id ?? null };
    },
  };
}

function makePgDb() {
  const pool = getPool();
  return {
    __pg: true,
    prepare: (sql) => pgPrepare(pool, sql),
    // pg simple query protocol รันหลาย statement ในครั้งเดียวได้ (ไม่มี params)
    exec: async (sql) => { await pool.query(translate(sql)); },
    close: () => closePool(),
  };
}

export function getDb() {
  if (db) return db;
  // P1: PostgreSQL is the only supported dialect — SQLite path removed.
  // (sync *Sync code paths remain as dead code pending incremental deletion;
  //  isPg() is now always true at runtime.)
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required — PostgreSQL is the only supported database (SQLite support removed)');
  }
  db = makePgDb();
  return db;
}

// SQLite dialect removed (P1) — ทุก code path ใช้ PostgreSQL เสมอ
export const isPg = () => true;

export async function closeDb() {
  if (!db) return;
  await closePool();
  db = null;
}

/**
 * txAsync() — transaction เดียวของระบบ (PostgreSQL only)
 * fn เป็น async เสมอ: `await txAsync(async (d) => { ... await d.prepare(...)... })`
 */
export async function txAsync(fn) {
  const { pgTx } = await import('./pg.js');
  return pgTx(async (client) => fn({ __pg: true, prepare: (sql) => pgPrepare(client, sql) }));
}

/** Generate a unique reference like TX-20261107-AB12CD */
export function makeReference(prefix) {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${ymd}-${rand}`;
}
