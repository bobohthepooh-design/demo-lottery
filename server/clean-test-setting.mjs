import { getDb } from './src/db/index.js';
getDb().prepare("DELETE FROM system_settings WHERE key='test_sse_ping'").run();
console.log('cleaned');
