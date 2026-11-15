import { getDb } from './src/db/index.js';
const db = getDb();
const users = db.prepare(`
  SELECT u.username, u.display_name, u.status, GROUP_CONCAT(r.name) roles
  FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id
  GROUP BY u.id ORDER BY u.id`).all();
users.forEach(u => console.log(u.username, '|', u.display_name, '|', u.status, '|', u.roles));
process.exit(0);
