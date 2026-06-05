import { config } from "../config.js";

// ─────────────────────────────────────────────────────────────
// IPFS proof storage (Web3.Storage or Pinata).
// The proof package bundles everything needed to independently verify a signal.
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
  hederaTxId: string;
}

/** Upload the proof package JSON to IPFS and return its CID. */
export async function uploadProofPackage(pkg: ProofPackage): Promise<{ cid: string }> {
  if (config.ipfs.provider === "pinata") {
    return uploadToPinata(pkg);
  }
  return uploadToWeb3Storage(pkg);
}

async function uploadToPinata(pkg: ProofPackage): Promise<{ cid: string }> {
  if (!config.ipfs.pinataJwt) throw new Error("PINATA_JWT not configured");
  const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.ipfs.pinataJwt}`,
    },
    body: JSON.stringify({ pinataContent: pkg }),
  });
  if (!res.ok) throw new Error(`Pinata upload failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { IpfsHash: string };
  return { cid: json.IpfsHash };
}

async function uploadToWeb3Storage(_pkg: ProofPackage): Promise<{ cid: string }> {
  if (!config.ipfs.web3StorageToken) throw new Error("WEB3_STORAGE_TOKEN not configured");
  // TODO: wire the @web3-storage/w3up-client upload flow.
  throw new Error("Web3.Storage upload not yet wired");
}

export function ipfsGatewayUrl(cid: string): string {
  return `https://ipfs.io/ipfs/${cid}`;
}
