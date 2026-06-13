import type { SignalDetail } from '@lenitnes/types';
import { Eye, Shield, ShieldCheck, Link, Zap } from 'lucide-react';
import type { ProofChainStep } from '@/components/ProofChain';

/**
 * Convert a live SignalDetail into interactive proof chain steps.
 * Each step maps to a real verifiable artifact when available,
 * or shows a "pending" state when the data is missing.
 */
export function getProofChainSteps(signal: SignalDetail | null): ProofChainStep[] {
  if (!signal) return [];

  return [
    {
      id: 0,
      label: 'Detect',
      icon: Eye,
      color: '#06b6d4',
      glowColor: 'rgba(6,182,212,0.15)',
      borderColor: 'rgba(6,182,212,0.5)',
      detail: signal.detected_at
        ? `TinyFish detection at ${new Date(signal.detected_at).toISOString()}. ${
            signal.condition_summary ?? 'Condition evaluated.'
          }`
        : 'Detection pending.',
      completed: !!signal.detected_at,
    },
    {
      id: 1,
      label: 'Timestamp',
      icon: Shield,
      color: '#10b981',
      glowColor: 'rgba(16,185,129,0.15)',
      borderColor: 'rgba(16,185,129,0.5)',
      detail: signal.hedera_tx_id
        ? 'Hedera HCS message submitted. Consensus timestamp with microsecond precision ensures tamper-evident proof.'
        : 'No Hedera HCS timestamp recorded. Verify your PROOF_MODE config.',
      href: signal.hedera_tx_id
        ? `https://hashscan.io/testnet/transaction/${encodeURIComponent(signal.hedera_tx_id)}`
        : undefined,
      completed: !!signal.hedera_tx_id,
    },
    {
      id: 2,
      label: 'Arbitrum',
      icon: ShieldCheck,
      color: '#3b82f6',
      glowColor: 'rgba(59,130,246,0.15)',
      borderColor: 'rgba(59,130,246,0.5)',
      detail: signal.arb_tx_hash
        ? 'Signal hash recorded on Arbitrum Sepolia. Verifiable on-chain proof.'
        : 'No Arbitrum proof recorded. Enable evmProof feature.',
      href: signal.arb_tx_hash ? `https://sepolia.arbiscan.io/tx/${signal.arb_tx_hash}` : undefined,
      completed: !!signal.arb_tx_hash,
    },
    {
      id: 3,
      label: 'Store',
      icon: Link,
      color: '#22d3ee',
      glowColor: 'rgba(34,211,238,0.15)',
      borderColor: 'rgba(34,211,238,0.5)',
      detail: signal.ipfs_cid
        ? 'Grove (Lens Protocol) stores evidence, screenshots, and metadata. Immutable IPFS-backed storage.'
        : 'No IPFS evidence package found.',
      href: signal.ipfs_cid ? (signal.proof?.ipfsUrl ?? undefined) : undefined,
      completed: !!signal.ipfs_cid,
    },
    {
      id: 4,
      label: 'Act',
      icon: Zap,
      color: '#f59e0b',
      glowColor: 'rgba(245,158,11,0.15)',
      borderColor: 'rgba(245,158,11,0.5)',
      detail:
        signal.orders && signal.orders.length > 0
          ? `${signal.orders.length} order(s) triggered. ${signal.orders.filter((o) => ['filled', 'placed'].includes(o.status)).length} active.`
          : 'No trade action configured or executed for this signal.',
      completed: (signal.orders?.length ?? 0) > 0,
    },
  ];
}
