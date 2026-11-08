// Skeleton loading — แทนข้อความ "กำลังโหลด..."
export function SkeletonCard({ className = '' }) {
  return <div className={`skeleton ${className}`} />;
}

// การ์ดโพย/รายการทั่วไป 1 ใบ
export function SkeletonSlip() {
  return (
    <div className="bg-navy-800 border border-navy-700 rounded-xl p-5 space-y-3">
      <div className="flex justify-between">
        <SkeletonCard className="h-5 w-32" />
        <SkeletonCard className="h-5 w-16" />
      </div>
      <SkeletonCard className="h-4 w-48" />
      <SkeletonCard className="h-4 w-24" />
    </div>
  );
}

export function SkeletonGrid({ count = 3 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="bg-navy-800 border border-navy-700 rounded-xl p-4 space-y-3">
          <SkeletonCard className="h-9 w-9 !rounded-full" />
          <SkeletonCard className="h-5 w-3/4" />
          <SkeletonCard className="h-4 w-full" />
          <SkeletonCard className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonCard key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
