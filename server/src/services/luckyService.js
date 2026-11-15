import { HttpError } from '../lib/audit.js';

/**
 * เลขเด็ด/เลขดัง — สถิติความถี่จากผลรางวัลจริง (lotterychecks.com public API)
 * ดึงเฉพาะตลาดที่มีสถิติจริง: หวยไทย + หวยลาว — Hanoi ไม่มี stats feed
 * cache 30 นาที กันยิง API ถี่
 */
const UA = { 'User-Agent': 'demo-lottery/1.0', Accept: 'application/json' };
const MARKETS = [
  { key: 'TH', lottery: 'thai-government', name_th: 'หวยไทย' },
  { key: 'LA', lottery: 'lao-lottery', name_th: 'หวยลาว' },
];
const TOP_N = 5;
let cache = { at: 0, data: null };

async function fetchStats(lottery) {
  const r = await fetch(`https://lotterychecks.com/api/public/stats?lottery=${lottery}`, { headers: UA, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`LC stats HTTP ${r.status}`);
  const j = await r.json();
  if (!j?.prizes?.length) throw new Error(`LC stats ${lottery}: no prizes`);
  return j;
}

export async function getLuckyNumbers() {
  if (cache.data && Date.now() - cache.at < 30 * 60 * 1000) return cache.data;
  const markets = [];
  const errors = [];
  for (const m of MARKETS) {
    try {
      const j = await fetchStats(m.lottery);
      markets.push({
        key: m.key,
        name_th: m.name_th,
        updatedAt: j.dataset?.lastDate || null,
        draws: j.dataset?.draws || null,
        prizes: j.prizes.map(p => ({
          prize: p.prize,
          prizeName: p.prizeName || p.prize,
          numbers: (p.numbers || []).slice(0, TOP_N).map(n => ({ number: n.number, count: n.count })),
        })).filter(p => p.numbers.length),
      });
    } catch (e) {
      errors.push(`${m.key}: ${e.message}`);
    }
  }
  if (!markets.length) throw new HttpError(502, `ดึงเลขเด็ดยังไม่ได้: ${errors.join('; ')}`);
  const data = { markets, source: 'lotterychecks.com', errors: errors.length ? errors : undefined };
  cache = { at: Date.now(), data };
  return data;
}
