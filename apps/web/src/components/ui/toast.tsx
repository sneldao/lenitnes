'use client';

import { createContext, useContext, useCallback, useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Check, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastCtx {
  toast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastCtx>({ toast: () => {} });

const kindStyles: Record<ToastKind, string> = {
  success: 'border-signal/30 bg-signal/10 text-signal',
  error: 'border-danger/30 bg-danger/10 text-danger',
  info: 'border-accent/30 bg-accent/10 text-accent',
};

const kindIcons: Record<ToastKind, React.ReactNode> = {
  success: <Check className="h-3.5 w-3.5" />,
  error: <X className="h-3.5 w-3.5" />,
  info: null,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const addToast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'animate-toast-in pointer-events-auto flex items-center gap-2 rounded-xl border px-4 py-3 text-sm shadow-card backdrop-blur-md',
              kindStyles[t.kind],
            )}
          >
            {kindIcons[t.kind]}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
