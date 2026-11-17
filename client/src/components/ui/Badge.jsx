// Badge มาตรฐาน — variant ตาม semantic tokens
// win=ถูกรางวัล lose=ไม่ถูก pending=รอผล danger=ผิดพลาด/แพ้หนัก info=ข้อมูล neutral=ทั่วไป
const VARIANTS = {
  win: 'bg-win-500/15 text-win-300 border-win-500/40',
  lose: 'bg-lose-400/10 text-lose-300 border-lose-400/30',
  pending: 'bg-pending-500/15 text-pending-300 border-pending-500/40',
  danger: 'bg-danger-500/15 text-danger-300 border-danger-500/40',
  info: 'bg-info-400/15 text-info-300 border-info-400/40',
  neutral: 'bg-navy-700/50 text-navy-300 border-navy-600/60',
};

export default function Badge({ variant = 'neutral', className = '', children }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[12px] font-semibold ${VARIANTS[variant]} ${className}`}>
      {children}
    </span>
  );
}
