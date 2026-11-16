import { txAsync } from './index.js';
import { config } from '../config.js';
import { hashPassword } from '../lib/password.js';
import { setSetting } from '../services/settingsService.js';
import { seedRulesV2 } from './seed-rules.js';

const ROLES = [
  { name: 'super_admin', description: 'สิทธิ์สูงสุด ทุก permission' },
  { name: 'admin', description: 'ผู้ดูแลระบบ (ไม่มีสิทธิ์จัดการ role/setting บางส่วน)' },
  { name: 'member', description: 'สมาชิกทั่วไป' },
];

const PERMISSIONS = [
  // member
  { code: 'lottery.view', description: 'ดูประเภท/รอบหวย' },
  { code: 'bet.place', description: 'แทงโพย' },
  { code: 'bet.view_own', description: 'ดูโพยของตนเอง' },
  { code: 'wallet.view_own', description: 'ดูกระเป๋าเครดิตของตนเอง' },
  { code: 'results.view', description: 'ดูผลรางวัล' },
  // admin
  { code: 'dashboard.admin', description: 'หน้า admin dashboard' },
  { code: 'members.manage', description: 'จัดการสมาชิก' },
  { code: 'roles.manage', description: 'จัดการ role/permission' },
  { code: 'lottery.manage', description: 'จัดการประเภทหวย/กติกา' },
  { code: 'draws.manage', description: 'จัดการรอบหวย' },
  { code: 'results.publish', description: 'ออกผลรางวัล' },
  { code: 'wallet.adjust', description: 'ปรับเครดิตสมาชิก' },
  { code: 'bets.view_all', description: 'ดูโพยทั้งหมด' },
  { code: 'reports.view', description: 'ดูรายงาน' },
  { code: 'audit.view', description: 'ดู audit log' },
  { code: 'security.view', description: 'ดู security events' },
  { code: 'settings.manage', description: 'จัดการ system settings' },
];

const ROLE_PERMS = {
  super_admin: ['*'],
  admin: [
    'dashboard.admin', 'members.manage', 'lottery.manage', 'draws.manage',
    'results.publish', 'wallet.adjust', 'bets.view_all', 'reports.view',
    'lottery.view', 'results.view',
  ],
  member: ['lottery.view', 'bet.place', 'bet.view_own', 'wallet.view_own', 'results.view'],
};

export async function seed() {
  await txAsync(async (d) => {
    // roles
    const roleIds = {};
    for (const r of ROLES) {
      await d.prepare('INSERT OR IGNORE INTO roles (name, description) VALUES (?, ?)').run(r.name, r.description);
      roleIds[r.name] = (await d.prepare('SELECT id FROM roles WHERE name = ?').get(r.name)).id;
    }
    // permissions
    const permIds = {};
    for (const p of PERMISSIONS) {
      await d.prepare('INSERT OR IGNORE INTO permissions (code, description) VALUES (?, ?)').run(p.code, p.description);
      permIds[p.code] = (await d.prepare('SELECT id FROM permissions WHERE code = ?').get(p.code)).id;
    }
    // role_permissions
    for (const [role, codes] of Object.entries(ROLE_PERMS)) {
      for (const c of codes) {
        if (c === '*') continue; // super_admin bypass via hasRole/perm '*'
        const pid = permIds[c];
        if (pid) await d.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)').run(roleIds[role], pid);
      }
    }
    // grant all permissions to super_admin explicitly
    for (const p of PERMISSIONS) {
      await d.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)').run(roleIds.super_admin, permIds[p.code]);
    }

    // lottery types
    const types = [
      { code: 'TH', name_th: 'หวยไทย', name_en: 'Thailand Government Lottery', description: 'ออกวันที่ 1 และ 16 ของทุกเดือน เวลา 15:00 น.' },
      { code: 'LA', name_th: 'หวยลาว', name_en: 'Laos Lottery', description: 'หวยลาว: จ–ศ 20:00 • ลาวพัฒนา: จ–ศ 20:30 • ลาวพัฒนาเช้า: ทุกวัน 09:00 น.' },
      { code: 'HN', name_th: 'หวยฮานอย', name_en: 'Hanoi Lottery', description: 'หวยเวียดนาม ออกทุกวัน 4 รอบ: เฉพาะกิจ 16:30 • พิเศษ 17:30 • ปกติ 18:30 • VIP 19:30 น. + ฮานอยทางการ (XSMB จริง) จันทร์/พฤหัสบดี 18:15 น. (เวลาไทย)' },
      { code: 'HR', name_th: 'หวยราศี', name_en: 'Zodiac Lottery', description: 'ทายดวงราศีแบบหวยไทย — ผลรางวัลเป็นราศี 6 ตัวเรียงลำดับ (รางวัลใหญ่/3 ราศีบน/2 ราศีล่าง/วิ่งราศี) ออกรางวัลทุก 1 ชั่วโมงนาฬิกา ตลอด 24 ชั่วโมง (DEMO)' },
      { code: 'GS', name_th: 'สลากออมสิน', name_en: 'GSB Savings Lottery', description: 'สลากออมสินพิเศษ — ออกวันที่ 1 และ 16 ของทุกเดือน ช่วงบ่าย ผลจริงจาก lotterychecks (gsb-lottery)' },
    ];
    const typeIds = {};
    for (const t of types) {
      await d.prepare('INSERT OR IGNORE INTO lottery_types (code, name_th, name_en, description) VALUES (?, ?, ?, ?)')
        .run(t.code, t.name_th, t.name_en, t.description);
      typeIds[t.code] = (await d.prepare('SELECT id FROM lottery_types WHERE code = ?').get(t.code)).id;
    }

    // super admin (password from env or default — CHANGE IN PRODUCTION)
    const adminPass = process.env.SEED_ADMIN_PASSWORD || 'Admin@Demo123';
    const existing = await d.prepare(`SELECT id FROM users WHERE username = 'admin'`).get();
    if (!existing) {
      const r = await d.prepare(`INSERT INTO users (username, email, password_hash, display_name) VALUES ('admin', 'admin@demo.local', ?, 'Super Admin')`)
        .run(hashPassword(adminPass));
      const uid = Number(r.lastInsertRowid);
      await d.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(uid, roleIds.super_admin);
      await d.prepare('INSERT INTO virtual_wallets (user_id, balance) VALUES (?, 0)').run(uid);
      console.log(`[seed] super admin created: admin / ${adminPass}  <-- change after first login`);
    }

    // settings
    await setSetting('site_name', 'Demo Lottery Platform', null);
    await setSetting('initial_credit', config.initialCredit, null);
    await setSetting('maintenance_mode', false, null);
    await setSetting('demo_notice', 'ระบบจำลองเพื่อการศึกษาเท่านั้น ใช้เครดิตเสมือน ไม่มีเงินจริง', null);
    await setSetting('announcement', { enabled: true, text: '🎉 ยินดีต้อนรับสู่ Demo Lottery — หวยไทย • หวยลาว • ฮานอย อัตราจ่ายสูงสุด x1,000 ใช้เครดิตจำลองเพื่อการศึกษา' }, null);
    await setSetting('cashback_percent', 0, null); // % คืนยอดเสียต่อวัน — 0 = ปิด, admin ตั้งในหน้าตั้งค่า
  });
  // กติกาหวยตามโครงสร้างจริงของแต่ละประเทศ (ทำหลัง tx หลักเพื่อเลี่ยง nested transaction)
  await seedRulesV2();
  console.log('[seed] done');
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  Promise.resolve(seed()).catch(e => { console.error(e); process.exit(1); });
}
