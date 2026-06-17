import { config } from '../config.js';

// ─────────────────────────────────────────────────────────────
// Grove proof storage (Lens Protocol).
// Immutable on-chain-controlled storage for signal proof packages.
// ─────────────────────────────────────────────────────────────

export interface ProofPackage {
  signalId: string;
  monitorId: string;
  detectedAt: string;
  url: string;
  condition: string;
  tinyfishRunId: string;
  evidence: string;
  summary: string;
  screenshots: string[];
  /**
   * Optional on-chain timestamp reference. After the pivot, the
   * HCS message ID stored in `signals.hedera_hcs_message_id` is
   * the canonical proof-of-timestamp; this field is kept for
   * backwards compatibility with existing Grove packages.
   */
  hederaTxId?: string;
}

interface GroveUploadResponse {
  storage_key: string;
  gateway_url: string;
  uri: string;
  status_url: string;
}

/** Upload the proof package JSON to Grove and return its storage key. */
export async function uploadProofPackage(pkg: ProofPackage): Promise<{ cid: string }> {
  const res = await fetch(`https://api.grove.storage/?chain_id=${config.grove.chainId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pkg),
  });
  if (!res.ok) throw new Error(`Grove upload failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as GroveUploadResponse;
  return { cid: json.storage_key };
}

export function groveGatewayUrl(storageKey: string): string {
  return `https://api.grove.storage/${storageKey}`;
}
