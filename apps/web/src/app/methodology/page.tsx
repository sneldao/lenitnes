// Public-facing methodology with progressive disclosure pillars and interactive disclosures.

import { MethodologyClient } from './MethodologyClient';

export const metadata = {
  title: 'How it works — LENITNES',
  description:
    'How LENITNES turns public commits to consensus-critical code into scored trades, gated by a versioned safety layer.',
};

export default function MethodologyPage() {
  return <MethodologyClient />;
}
