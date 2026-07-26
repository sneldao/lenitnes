'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Observes an element and flips to true once it enters the viewport.
 * Fires only once (unobserve after trigger) so reveals never re-arm.
 * Returns immediately true under prefers-reduced-motion and when
 * IntersectionObserver is unavailable, so content is never hidden
 * from users who should not wait for it.
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(rootMargin = '0px 0px -10% 0px') {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return { ref, inView };
}
