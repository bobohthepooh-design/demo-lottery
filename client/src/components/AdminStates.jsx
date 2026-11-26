import { SkeletonCard, SkeletonGrid } from './Skeleton.jsx';

// Skeleton loading สำหรับหน้า admin — KPI cards + แถวตาราง จำลองโครง layout จริง
export function AdminLoading({ label = 'กำลังโหลดข้อมูล...' }) {
  return (
    <div className="space-y-4" role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      <SkeletonGrid count={3} />
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonCard key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}

// กล่อง error พร้อมปุ่มลองใหม่ — ใช้แทน error text เปล่าในหน้า admin
export function AdminError({ message, onRetry }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-[rgba(239,68,68,0.4)] bg-[rgba(239,68,68,0.1)] p-5 text-center space-y-3"
    >
      <div className="text-sm font-bold [color:var(--danger-red)]">โหลดข้อมูลไม่สำเร็จ</div>
      {message && <div className="text-xs [color:var(--muted-gray)] break-words">{message}</div>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="luxury-btn text-sm px-4 py-2"
        >
          ลองใหม่
        </button>
      )}
    </div>
  );
}
