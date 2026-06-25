import { Check, X } from 'lucide-react';

export function CheckItem({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="stat-card flex items-start gap-3">
      <div
        className={
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ' +
          (ok ? 'bg-signal/15 text-signal' : 'bg-danger/10 text-danger')
        }
      >
        {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-200">{label}</p>
        <p className={`mt-0.5 line-clamp-2 text-xs ${ok ? 'text-slate-500' : 'text-danger/70'}`}>
          {detail}
        </p>
      </div>
    </div>
  );
}
