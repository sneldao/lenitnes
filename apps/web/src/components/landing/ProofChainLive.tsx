'use client';

import { useReveal } from '@/lib/useReveal';
import ProofChain, { type ProofChainStep } from '@/components/ProofChain';
import { Eye, Shield, Link, Zap } from 'lucide-react';

const DEMO_STEPS: ProofChainStep[] = [
  {
    id: 0,
    label: 'Detect',
    icon: Eye,
    color: '#06b6d4',
    glowColor: 'rgba(6,182,212,0.15)',
    borderColor: 'rgba(6,182,212,0.5)',
    detail: 'Commit d8e48efd lands in zcash/halo2. Keywords: verifying key, anchor, security.',
  },
  {
    id: 1,
    label: 'Timestamp',
    icon: Shield,
    color: '#10b981',
    glowColor: 'rgba(16,185,129,0.15)',
    borderColor: 'rgba(16,185,129,0.5)',
    detail: 'Hedera HCS records at T+0. Consensus timestamp: microsecond accuracy.',
  },
  {
    id: 2,
    label: 'Store',
    icon: Link,
    color: '#22d3ee',
    glowColor: 'rgba(34,211,238,0.15)',
    borderColor: 'rgba(34,211,238,0.5)',
    detail: 'Grove stores screenshot, diff, SHA. IPFS CID generated.',
  },
  {
    id: 3,
    label: 'Act',
    icon: Zap,
    color: '#f59e0b',
    glowColor: 'rgba(245,158,11,0.15)',
    borderColor: 'rgba(245,158,11,0.5)',
    detail: 'Kraken rule triggers. ZEC hedge executed before news breaks.',
  },
];

export default function ProofChainLive() {
  const containerRef = useReveal();

  return (
    <div ref={containerRef} className="py-24">
      <ProofChain
        steps={DEMO_STEPS}
        title="Four steps. Fully automated."
        subtitle="Cryptographically verifiable."
      />
    </div>
  );
}
