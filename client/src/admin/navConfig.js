// nav config กลางของ admin — ใช้ร่วมกันระหว่าง AdminLayout (sidebar/drawer),
// CommandPalette (Ctrl+K) และ Layout.jsx (เมนู admin บน header)
export const adminGroups = [
  {
    label: 'ภาพรวม',
    items: [
      { to: '/admin', label: 'ภาพรวม', icon: 'dashboard', end: true, perm: 'dashboard.admin' },
      { to: '/admin/reports', label: 'รายงาน', icon: 'reports', perm: 'reports.view' },
      { to: '/admin/health', label: 'สุขภาพระบบ', icon: 'bell', perm: 'dashboard.admin' },
    ],
  },
  {
    label: 'กำกับดูแล',
    items: [
      { to: '/admin/approvals', label: 'ศูนย์อนุมัติ', icon: 'audit', perm: 'approvals.view' },
      { to: '/admin/admin-users', label: 'บัญชีผู้ดูแล', icon: 'user', perm: 'admin.users.manage' },
    ],
  },
  {
    label: 'จัดการข้อมูล',
    items: [
      { to: '/admin/members', label: 'สมาชิก', icon: 'members', perm: 'members.manage' },
      { to: '/admin/lotteries', label: 'ประเภทหวย/กติกา', icon: 'lotteries', perm: 'lottery.manage' },
      { to: '/admin/draws', label: 'รอบหวย', icon: 'draws', perm: 'draws.manage' },
      { to: '/admin/bets', label: 'ตรวจโพย', icon: 'bets', perm: 'bets.view_all' },
      { to: '/admin/chat', label: 'แชทสมาชิก', icon: 'chat', perm: 'members.manage' },
      { to: '/admin/tickets', label: 'ตั๋วสนับสนุน', icon: 'ticket', perm: 'members.manage' },
      { to: '/admin/broadcast', label: 'แจ้งเตือนสมาชิก', icon: 'volume', perm: 'members.manage' },
    ],
  },
  {
    label: 'เครดิต & ระบบ',
    items: [
      { to: '/admin/wallet', label: 'จัดการเครดิต', icon: 'wallet', perm: 'wallet.adjust' },
      { to: '/admin/payments', label: 'เติม/ถอนเงิน', icon: 'wallet', perm: 'wallet.adjust' },
      { to: '/admin/banner', label: 'แบนเนอร์หน้าแรก', icon: 'banner', perm: 'settings.manage' },
      { to: '/admin/audit', label: 'Audit Log', icon: 'audit', perm: 'audit.view' },
      { to: '/admin/security', label: 'Security Events', icon: 'security', perm: 'security.view' },
      { to: '/admin/settings', label: 'ตั้งค่าระบบ', icon: 'settings', perm: 'settings.manage' },
      { to: '/admin/roles', label: 'สิทธิ์การใช้งาน', icon: 'roles', perm: 'roles.manage' },
    ],
  },
];
