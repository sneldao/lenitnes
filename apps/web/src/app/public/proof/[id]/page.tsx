'use client';

import { use } from 'react';
import dynamic from 'next/dynamic';

// Reuses the existing SignalDetailPage in public mode.
// The route path selects the public variant; the signed `share` query authorizes API access.
const SignalDetailPage = dynamic(() => import('@/app/signals/[id]/page'), { ssr: false });

export default function PublicProofPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return <SignalDetailPage params={Promise.resolve({ id })} />;
}
