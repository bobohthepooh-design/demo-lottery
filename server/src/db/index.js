import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
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
  if (config.databaseUrl) {
    db = makePgDb();
    return db;
  }
  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  db = new DatabaseSync(config.databasePath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA synchronous = NORMAL');
  return db;
}

export const isPg = () => !!config.databaseUrl;

export async function closeDb() {
  if (!db) return;
  if (db.__pg) await closePool(); else db.close();
  db = null;
}

/**
 * tx() — SYNC เดิม (sqlite เท่านั้น) — pg mode จะ throw เพื่อบังคับให้ code ที่ยังไม่ port
 * ใช้ txAsync แทน ช่วง migration (ดู MIGRATION.md Step 3)
 */
export function tx(fn) {
  const d = getDb();
  if (d.__pg) throw new Error('tx() ไม่รองรับ PostgreSQL — ใช้ txAsync() แทน (code ยังไม่ port)');
  d.exec('BEGIN IMMEDIATE');
  try {
    const result = fn(d);
    d.exec('COMMIT');
    return result;
  } catch (err) {
    try { d.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw err;
  }
}

/**
 * txAsync() — ใช้แทน tx() ใน code ที่ port แล้ว
 * fn เป็น async เสมอ: `await txAsync(async (d) => { ... await d.prepare(...)... })`
 * ใน fn ใช้ d.prepare().get/all/run แบบ await ได้ทั้ง sqlite และ pg
 */
export async function txAsync(fn) {
  const d = getDb();
  if (d.__pg) {
    const { pgTx } = await import('./pg.js');
    // ส่ง facade ที่มี .prepare() เหมือน DatabaseSync — code ที่ port แล้วใช้
    // `await d.prepare(sql).get/all/run(...)` ได้เหมือนเดิมทั้ง 2 โหมด
    return pgTx(async (client) => fn({ __pg: true, prepare: (sql) => pgPrepare(client, sql) }));
  }
  d.exec('BEGIN IMMEDIATE');
  try {
    const result = await fn(d);
    d.exec('COMMIT');
    return result;
  } catch (err) {
    try { d.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw err;
  }
}

/** Generate a unique reference like TX-20261107-AB12CD */
export function makeReference(prefix) {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${ymd}-${rand}`;
}
