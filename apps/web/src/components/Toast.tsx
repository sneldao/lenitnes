'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'warn' | 'info';

interface Toast {
  id: number;
  variant: ToastVariant;
  message: string;
}

interface ToastContextType {
  success: (msg: string) => void;
  error: (msg: string) => void;
  warn: (msg: string) => void;
  info: (msg: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const add = useCallback((variant: ToastVariant, message: string) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, variant, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const ctx: ToastContextType = {
    success: (msg) => add('success', msg),
    error: (msg) => add('error', msg),
    warn: (msg) => add('warn', msg),
    info: (msg) => add('info', msg),
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const VARIANT_STYLES: Record<
  ToastVariant,
  { bg: string; border: string; icon: typeof CheckCircle2; color: string }
> = {
  success: {
    bg: 'bg-signal/10',
    border: 'border-signal/30',
    icon: CheckCircle2,
    color: 'text-signal',
  },
  error: { bg: 'bg-danger/10', border: 'border-danger/30', icon: XCircle, color: 'text-danger' },
  warn: { bg: 'bg-warn/10', border: 'border-warn/30', icon: AlertTriangle, color: 'text-warn' },
  info: { bg: 'bg-accent/10', border: 'border-accent/30', icon: Info, color: 'text-accent' },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const style = VARIANT_STYLES[toast.variant];
  const Icon = style.icon;

  return (
    <div
      role="alert"
      className={`pointer-events-auto flex items-center gap-3 rounded-xl border ${style.border} ${style.bg} px-4 py-3 shadow-card backdrop-blur-md animate-toast-in`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${style.color}`} />
      <span className="text-sm text-slate-200">{toast.message}</span>
      <button
        onClick={onDismiss}
        className="ml-2 shrink-0 rounded-md p-0.5 text-slate-500 transition-colors hover:text-slate-300"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
