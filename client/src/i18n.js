// i18n เบาๆ — TH/ລາວ สำหรับส่วน chrome (nav/footer/bottom nav)
// เก็บภาษาที่เลือกใน localStorage (รายอุปกรณ์) — เพิ่ม key ได้เรื่อยๆ
const dict = {
  th: {
    home: 'หน้าแรก', betMenu: 'แทงหวย', winners: 'ผู้ชนะ', mybets: 'โพยของฉัน',
    perf: 'ผลงาน', wallet: 'กระเป๋าเครดิต', profile: 'โปรไฟล์', admin: 'ผู้ดูแลระบบ',
    logout: 'ออกจากระบบ', login: 'เข้าสู่ระบบ', register: 'สมัครสมาชิก',
    credit: 'เครดิต', menu: 'เมนู', lottery: 'หวย', walletShort: 'กระเป๋า',
    footer: 'Demo Lottery Platform — เพื่อการศึกษาเท่านั้น • ใช้เครดิตเสมือน ไม่เกี่ยวข้องกับการพนันเงินจริง',
    demoMode: 'DEMO MODE',
  },
  lo: {
    home: 'ໜ້າຫຼັກ', betMenu: 'ຫວຍ', winners: 'ຜູ້ຊະນະ', mybets: 'ໂພຍຂອງຂ້ອຍ',
    perf: 'ຜົນງານ', wallet: 'ກະເປົາເຄຣດິດ', profile: 'ໂປຣໄຟລ໌', admin: 'ຜູ້ດູແລລະບົບ',
    logout: 'ອອກຈາກລະບົບ', login: 'ເຂົ້າສູ່ລະບົບ', register: 'ສະໝັກສະມາຊິກ',
    credit: 'ເຄຣດິດ', menu: 'ເມນູ', lottery: 'ຫວຍ', walletShort: 'ກະເປົາ',
    footer: 'ເວັບໄຊ Demo Lottery — ສຳລັບການສຶກສາເທົ່ານັ້ນ • ໃຊ້ເຄຣດິດສົມມຸດ ບໍ່ກ່ຽວຂ້ອງກັບການພະນັນເງິນຈິງ',
    demoMode: 'DEMO MODE',
  },
};

export function getLang() {
  try { return localStorage.getItem('app_lang') === 'lo' ? 'lo' : 'th'; } catch { return 'th'; }
}
export function setLang(l) {
  try { localStorage.setItem('app_lang', l === 'lo' ? 'lo' : 'th'); } catch {}
  document.documentElement.lang = l === 'lo' ? 'lo' : 'th';
  window.dispatchEvent(new Event('langchange'));
}
export function toggleLang() { setLang(getLang() === 'lo' ? 'th' : 'lo'); }
export function t(key) { return dict[getLang()]?.[key] ?? dict.th[key] ?? key; }
export function isLao() { return getLang() === 'lo'; }
