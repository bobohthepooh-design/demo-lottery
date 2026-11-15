import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('server/data/demo-lottery.db');
db.prepare("UPDATE system_settings SET value=? WHERE key='scratch_prizes'").run(JSON.stringify([
  { icon: '🍒', prize: 1500 }, { icon: '🍋', prize: 3000 }, { icon: '🍊', prize: 5000 },
  { icon: '🍇', prize: 9000 }, { icon: '🔔', prize: 20000 }, { icon: '⭐', prize: 60000 },
  { icon: '💎', prize: 180000 }, { icon: '7️⃣', prize: 800000 },
]));
console.log('prizes updated');
