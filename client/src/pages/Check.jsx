import CheckNumbers from '../components/CheckNumbers.jsx';
import '../styles/luxury-theme.css';

export default function Check() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-black luxury-gradient-text">ตรวจเลข</h1>
        <p className="text-sm text-gray-400 mt-1">ใส่เลขเพื่อตรวจผลรางวัลย้อนหลัง — ไม่ต้องเข้าสู่ระบบ</p>
      </div>
      <CheckNumbers />
    </div>
  );
}
