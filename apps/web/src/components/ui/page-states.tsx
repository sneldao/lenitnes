'use client';

import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';

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
 * Full-page centered error state with a retry action.
 * Message names what failed; the button offers immediate recovery.
 */
export function PageError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="card max-w-md border-danger/30 bg-danger/5 text-center">
        <AlertCircle className="mx-auto mb-3 h-5 w-5 text-danger" />
        <p className="text-sm text-danger">{message}</p>
        <button
          onClick={onRetry ?? (() => window.location.reload())}
          className="btn-danger mt-4 inline-flex items-center gap-2 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </button>
      </div>
    </div>
  );
}
