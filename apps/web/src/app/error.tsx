'use client';

/**
 * Root error boundary for route segments — catches errors in page
 * content while keeping the root layout (nav, footer) visible.
 *
 * Only renders when an error propagates past a local error boundary.
 * Uses minimal styling to avoid dependency on layout context.
 */

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-danger/10 text-lg font-black text-danger">
        !
      </div>
      <h2 className="mb-2 text-xl font-bold text-slate-100">Something went wrong</h2>
      <p className="mb-6 max-w-md text-sm text-slate-400">
        An unexpected error occurred in this section. The rest of the page should still work.
      </p>
      {error.digest && (
        <p className="mb-6 font-mono text-[10px] text-slate-600">Error ref: {error.digest}</p>
      )}
      <button
        type="button"
        onClick={() => reset()}
        className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-ink shadow-glow-sm transition-all hover:bg-accent-glow hover:shadow-glow"
      >
        Try again
      </button>
    </div>
  );
}
