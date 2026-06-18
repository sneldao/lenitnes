// Stub: zero-headcount pivot removed per-user toasts. Kept as a
// no-op so layout.tsx keeps compiling until the dashboard pages
// that use toasts are cleaned up (Day 9+).
'use client';
import { type ReactNode } from 'react';
import { useCallback } from 'react';

export function ToastProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useToast() {
  return {
    toast: useCallback(() => {}, []),
    success: useCallback(() => {}, []),
    error: useCallback(() => {}, []),
  };
}
