import { autoSettleResults } from './src/services/resultFetcher.js';
const out = await autoSettleResults();
console.log(JSON.stringify(out, null, 1));
process.exit(0);
