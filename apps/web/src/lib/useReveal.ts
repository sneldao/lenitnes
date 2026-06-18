// Stub: zero-headcount pivot removed reveal animations. The new
// public landing page uses CSS-only motion (CSS transitions on
// the .reveal.in-view class). Kept as a no-op so older pages
// keep compiling.
'use client';
import { useEffect } from 'react';
export function useReveal() {
  useEffect(() => {}, []);
}
