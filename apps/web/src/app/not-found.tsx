import Link from 'next/link';

/**
 * Custom 404 — overrides Next.js's default Pages-Router-flavoured 404
 * that breaks during prerender ('<Html> should not be imported outside
 * of pages/_document').
 *
 * Server component: no hooks, no layout context, just static markup.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger/10 text-2xl font-black text-danger">
        404
      </div>
      <h1 className="mb-2 text-2xl font-bold text-slate-100">Page not found</h1>
      <p className="mb-8 max-w-md text-sm text-slate-400">
        This page doesn&apos;t exist or the link may be broken.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-ink shadow-glow-sm transition-all hover:bg-accent-glow hover:shadow-glow"
      >
        Go home
      </Link>
    </div>
  );
}
