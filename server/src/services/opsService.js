import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { q, qRun } from '../db/pg.js';
import { getSetting, setSetting } from './settingsService.js';

// ---------- logical backup ----------
// dump ทุกตาราง public → JSON gzip ที่ server/data/backups/ (volume lottery-data)
// หมายเหตุ: เป็น logical backup ระดับ row — restore ด้วยมือผ่าน psql/script (ไม่ใช่ pg_dump binary)
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.resolve(__dirname, '../data/backups');

export async function createBackup({ note = null } = {}) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const tables = (await q(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`)).map(r => r.tablename);
  const dump = { createdAt: new Date().toISOString(), note, tables: {} };
  for (const t of tables) {
    dump.tables[t] = await q(`SELECT * FROM "${t}"`);
  }
  const stamp = dump.createdAt.replace(/[:.]/g, '-').slice(0, 19);
  const file = `backup-${stamp}.json.gz`;
  const buf = zlib.gzipSync(Buffer.from(JSON.stringify(dump), 'utf8'));
  fs.writeFileSync(path.join(BACKUP_DIR, file), buf);
  return { file, sizeBytes: buf.length, tables: tables.length, rows: Object.values(dump.tables).reduce((a, r) => a + r.length, 0) };
}

export function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json.gz')).sort().reverse()
    .map(f => {
      const st = fs.statSync(path.join(BACKUP_DIR, f));
      return { file: f, sizeBytes: st.size, createdAt: st.mtime.toISOString() };
    });
}

// ---------- retention ----------
// ลบ security_events/auth_events เก่ากว่า N วัน + audit_logs เฉพาะแถว legacy (hash IS NULL)
// แถว audit ที่อยู่ใน hash-chain ห้ามลบเด็ดขาด — จะทำให้ verify chain พัง
export async function maybeRunRetention() {
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  if (await getSetting('retention_last_run') === today) return null;
  const secDays = Math.max(1, Number(await getSetting('retention_security_days', 90)) || 90);
  const authDays = Math.max(1, Number(await getSetting('retention_auth_events_days', 180)) || 180);
  const auditDays = Math.max(1, Number(await getSetting('retention_audit_legacy_days', 365)) || 365);
  const secCut = `to_char((now() AT TIME ZONE 'UTC') - interval '${secDays} days','YYYY-MM-DD HH24:MI:SS')`;
  const authCut = `to_char((now() AT TIME ZONE 'UTC') - interval '${authDays} days','YYYY-MM-DD HH24:MI:SS')`;
  const auditCut = `to_char((now() AT TIME ZONE 'UTC') - interval '${auditDays} days','YYYY-MM-DD HH24:MI:SS')`;
  const r1 = await qRun(`DELETE FROM security_events WHERE created_at < ${secCut}`);
  const r2 = await qRun(`DELETE FROM auth_events WHERE created_at < ${authCut}`);
  const r3 = await qRun(`DELETE FROM audit_logs WHERE hash IS NULL AND created_at < ${auditCut}`);
  await setSetting('retention_last_run', today, null);
  const out = { date: today, securityEvents: r1.changes, authEvents: r2.changes, auditLegacy: r3.changes };
  if (r1.changes || r2.changes || r3.changes) console.log('[retention]', JSON.stringify(out));
  return out;
}
