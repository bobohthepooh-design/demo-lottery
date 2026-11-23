#!/usr/bin/env node
/**
 * Load test — ไม่ต้องมี dependency เพิ่ม
 * ใช้: BASE_URL=http://localhost:4000 DURATION=15 CONCURRENCY=20 node tests/load.mjs
 *
 * ยิง public endpoints ที่ไม่ต้อง auth (health/types/draws/results) แบบ concurrent
 * รายงาน RPS + latency p50/p95/p99 + error rate — เหมาะเช็ค regression หลัง deploy
 * หรือเทียบ before/after ตอนเพิ่ม feature
 */
const BASE = process.env.BASE_URL || 'http://localhost:4000';
const DURATION_S = parseInt(process.env.DURATION || '15', 10);
const CONC = parseInt(process.env.CONCURRENCY || '20', 10);

const PATHS = ['/api/health', '/api/public/types', '/api/public/draws'];
// /api/public/results ต้องมี ?lottery= — เติมทีหลังถ้าต้องการ

const lat = [];
let okCount = 0, errCount = 0, rlCount = 0; // rlCount = 429 rate-limited (by design)
const t0 = Date.now();
const deadline = t0 + DURATION_S * 1000;

async function worker() {
  let i = 0;
  while (Date.now() < deadline) {
    const path = PATHS[i++ % PATHS.length];
    const s = performance.now();
    try {
      const r = await fetch(BASE + path);
      await r.arrayBuffer(); // drain body
      lat.push(performance.now() - s);
      if (r.status === 200) okCount++;
      else if (r.status === 429) rlCount++;
      else errCount++;
    } catch {
      lat.push(performance.now() - s);
      errCount++;
    }
  }
}

await Promise.all(Array.from({ length: CONC }, worker));
const secs = (Date.now() - t0) / 1000;
lat.sort((a, b) => a - b);
const pct = (p) => lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * p))].toFixed(1) : '-';

console.log(`\n=== Load test: ${BASE} ===`);
console.log(`duration ${secs.toFixed(1)}s | concurrency ${CONC} | total ${lat.length} req`);
console.log(`RPS ${(lat.length / secs).toFixed(1)} | ok ${okCount} | rate-limited(429) ${rlCount} | err ${errCount} (${(errCount / Math.max(1, lat.length) * 100).toFixed(2)}%)`);
console.log(`latency ms — p50 ${pct(0.5)} | p95 ${pct(0.95)} | p99 ${pct(0.99)} | max ${lat.length ? lat[lat.length - 1].toFixed(1) : '-'}`);
