import type { Signal } from '@/lib/api';

export function ProofProgress({ signal }: { signal: Signal }) {
  const steps = [
    { label: 'Hedera', done: Boolean(signal.hedera_tx_id), color: 'bg-signal' },
    { label: 'IPFS', done: Boolean(signal.ipfs_cid), color: 'bg-cyan-400' },
    { label: 'Arbitrum', done: Boolean(signal.arb_tx_hash), color: 'bg-violet' },
    { label: 'Trade', done: (signal.orders_count ?? 0) > 0, color: 'bg-warn' },
  ];

  const completed = steps.filter((s) => s.done).length;
  const total = steps.length;

  return (
    <div className="flex items-center gap-1.5">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center gap-0">
          <div
            className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${
              step.done ? step.color : 'bg-edge'
            } ${step.done ? 'shadow-glow-sm' : ''}`}
            title={`${step.label}: ${step.done ? 'Done' : 'Pending'}`}
          />
          {i < steps.length - 1 && (
            <div
              className={`h-px w-2 transition-all duration-300 ${
                step.done ? 'bg-edge-light' : 'bg-edge/50'
              }`}
            />
          )}
        </div>
      ))}
      <span className="ml-1 text-[9px] font-mono text-slate-600">
        {completed}/{total}
      </span>
    </div>
  );
}
