'use client';

import { Loader2, AlertCircle } from 'lucide-react';

/**
 * Full-page centered loading spinner.
 * Use for top-level page data fetches.
 */
export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-20 text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

/**
 * Full-page centered error state.
 */
export function PageError({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-20">
      <div className="card max-w-md border-danger/30 bg-danger/5 text-center">
        <AlertCircle className="mx-auto mb-3 h-5 w-5 text-danger" />
        <p className="text-sm text-danger">{message}</p>
      </div>
    </div>
  );
}
