import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-xl bg-edge/40', className)} {...props} />;
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-edge/60 bg-panel/80 p-6 shadow-card">
      <Skeleton className="mb-3 h-3 w-24" />
      <Skeleton className="mb-2 h-8 w-32" />
      <Skeleton className="h-3 w-48" />
    </div>
  );
}

function SkeletonStatCard() {
  return (
    <div className="rounded-xl border border-edge/40 bg-ink-light/50 p-4 backdrop-blur-sm">
      <Skeleton className="mb-2 h-3 w-20" />
      <Skeleton className="h-7 w-24" />
    </div>
  );
}

function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-edge/40 bg-panel/60 backdrop-blur-xl">
      <div className="border-b border-edge/40 bg-ink-light/30 p-3">
        <Skeleton className="h-3 w-full max-w-md" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-edge/20 p-3 last:border-b-0"
        >
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-edge/60 bg-panel p-4"
        >
          <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-2.5 w-2/5" />
          </div>
          <Skeleton className="h-6 w-20 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export { Skeleton, SkeletonCard, SkeletonStatCard, SkeletonTable, SkeletonList };
