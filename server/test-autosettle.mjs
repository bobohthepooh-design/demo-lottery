// เทส autoSettleResults ตรงๆ (ไม่ผ่าน HTTP/auth)
process.env.DATABASE_PATH = 'data/demo-lottery.db';
const { autoSettleResults } = await import('./src/services/resultFetcher.js');
const t0 = Date.now();
const out = await autoSettleResults();
console.log(`(${Date.now() - t0}ms)`);
console.log(JSON.stringify(out, null, 2));
process.exit(0);
