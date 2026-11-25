// i18n — ภาษาไทยอย่างเดียวสำหรับส่วน chrome (nav/footer/bottom nav)
// (เคยรองรับ Lao — ถูกถอดออกตามคำสั่งผู้ใช้)
const dict = {
  th: {
    home: 'หน้าแรก', betMenu: 'แทงหวย', winners: 'ผู้ชนะ', results: 'ผลรางวัล', check: 'ตรวจเลข', mybets: 'โพยของฉัน',
    playHub: 'เลือกหวย/รอบ', gamesHub: 'เกมด่วน',
    perf: 'ผลงาน', wallet: 'กระเป๋าเครดิต', profile: 'โปรไฟล์', admin: 'ผู้ดูแลระบบ', support: 'ช่วยเหลือ',
    logout: 'ออกจากระบบ', login: 'เข้าสู่ระบบ', register: 'สมัครสมาชิก',
    credit: 'เครดิต', menu: 'เมนู', lottery: 'หวย', walletShort: 'กระเป๋า', more: 'เพิ่มเติม', close: 'ปิด',
    mybetsShort: 'โพย',
    footer: 'Devin Lottery Platform — เพื่อการศึกษาเท่านั้น • ใช้เครดิตเสมือน ไม่เกี่ยวข้องกับการพนันเงินจริง',
    demoMode: 'DEMO MODE',
    navBet: 'เล่นหวย', navInfo: 'ผลรางวัล & ข้อมูล', navAccount: 'บัญชีของฉัน', navAdmin: 'ผู้ดูแลระบบ',
  },
};

export function getLang() { return 'th'; }
export function t(key) { return dict.th[key] ?? key; }
