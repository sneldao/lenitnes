// Dynamic Open Graph image for public proof links.
// Renders a 1200×630 branded card summarizing the signal so that shares
// to X/Slack/LinkedIn unfurl with a real preview rather than a blank card.

import { ImageResponse } from 'next/og';

// Server-rendered; node runtime is fine and matches the rest of the app.
export const runtime = 'nodejs';
export const alt = 'LENITNES proof — Hedera + Arbitrum';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Pull the colours from globals.css so the OG card matches the product surface.
// (Hardcoded here because `next/og` doesn't ship the Tailwind theme.)
const COLORS = {
  bg: '#0a0e17',
  panel: '#0f1421',
  edge: '#1f2937',
  ink: '#0a0e17',
  accent: '#06b6d4', // cyan
  signal: '#10b981', // green
  violet: '#8b5cf6', // violet
  warn: '#f59e0b',
  danger: '#ef4444',
  text: '#e2e8f0',
  textMuted: '#64748b',
  textDim: '#475569',
};

const TYPE_META: Record<string, { label: string; color: string }> = {
  emergency_patch: { label: 'Emergency patch', color: COLORS.danger },
  security_critical_patch: { label: 'Security critical', color: COLORS.warn },
  governance_shift: { label: 'Governance shift', color: COLORS.violet },
  silent_merge: { label: 'Silent merge', color: COLORS.accent },
  protocol_upgrade: { label: 'Protocol upgrade', color: COLORS.signal },
  dependency_rotation: { label: 'Dependency rotation', color: COLORS.accent },
  maintainer_departure: { label: 'Maintainer departure', color: COLORS.warn },
  supply_chain_risk: { label: 'Supply chain risk', color: COLORS.danger },
};

interface PublicProofPayload {
  id: string;
  detected_at: string;
  condition_summary: string | null;
  hedera_tx_id: string | null;
  ipfs_cid: string | null;
  is_heartbeat: boolean;
  monitor?: { url?: string; condition_text?: string } | null;
}

function hostFromUrl(url?: string | null): string {
  if (!url) return 'unknown';
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/.*/, '');
  }
}

function topClassificationLabel(summary: string | null | undefined): {
  label: string;
  color: string;
  score: number | null;
} {
  // The public proof payload doesn't include classifications, but the
  // condition_summary often starts with a detector label. We do a best-effort
  // match so the card has a classification header.
  if (!summary) return { label: 'Signal detected', color: COLORS.signal, score: null };
  const lower = summary.toLowerCase();
  for (const [key, meta] of Object.entries(TYPE_META)) {
    if (lower.includes(key.replace(/_/g, ' ')))
      return { label: meta.label, color: meta.color, score: null };
  }
  return { label: 'Signal detected', color: COLORS.signal, score: null };
}

export default async function Image({
  id,
  params,
  searchParams,
}: {
  // Next.js 16 passes the resolved dynamic param as `id` directly (alongside
  // `params` for completeness). Older versions only had `params.id`, so we
  // accept both to be safe across the App Router variants.
  id?: string;
  params?: { id: string };
  searchParams?: { [k: string]: string | string[] | undefined };
}) {
  const signalId = id ?? params?.id ?? '';
  const share = typeof searchParams?.share === 'string' ? searchParams.share : undefined;
  const idShort = signalId ? signalId.slice(0, 8) : '';

  // Fetch the public proof payload server-side. Fall back to a generic
  // "LENITNES proof" card if the share token is missing or the API errors.
  let data: PublicProofPayload | null = null;
  try {
    const apiBase =
      process.env.API_INTERNAL_URL ||
      (process.env.NODE_ENV === 'production' ? 'http://api:8742' : 'http://localhost:4000');
    const qs = share ? `?share=${encodeURIComponent(share)}` : '';
    const res = await fetch(`${apiBase}/proof/public/${signalId}${qs}`, {
      cache: 'no-store',
    });
    if (res.ok) {
      data = (await res.json()) as PublicProofPayload;
    }
  } catch {
    // Fall through to generic card.
  }

  const host = hostFromUrl(data?.monitor?.url);
  const classification = topClassificationLabel(data?.condition_summary);
  const summary =
    data?.condition_summary?.slice(0, 180) ?? 'Cryptographically anchored web signal.';
  const detectedAt = data?.detected_at
    ? new Date(data.detected_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
    : '';
  const hederaOk = Boolean(data?.hedera_tx_id);
  const ipfsOk = Boolean(data?.ipfs_cid);
  const proofId = data?.id ? data.id.slice(0, 8) : idShort;

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        background: COLORS.bg,
        display: 'flex',
        flexDirection: 'column',
        padding: 56,
        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
        color: COLORS.text,
        position: 'relative',
      }}
    >
      {/* Background grid pattern */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(31,41,55,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(31,41,55,0.4) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          display: 'flex',
        }}
      />
      {/* Top-right glow accent */}
      <div
        style={{
          position: 'absolute',
          top: -200,
          right: -200,
          width: 500,
          height: 500,
          borderRadius: 9999,
          background: `radial-gradient(circle, ${COLORS.violet}33 0%, transparent 70%)`,
          display: 'flex',
        }}
      />

      {/* ── Header row ─────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Logo mark — geometric shield */}
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: `linear-gradient(135deg, ${COLORS.accent} 0%, ${COLORS.violet} 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              color: COLORS.ink,
              fontWeight: 800,
            }}
          >
            L
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>LENITNES</div>
            <div style={{ fontSize: 12, color: COLORS.textMuted, letterSpacing: 2 }}>
              CRYPTOGRAPHIC PROOF
            </div>
          </div>
        </div>
        <div
          style={{
            fontSize: 12,
            color: COLORS.textDim,
            fontFamily: 'ui-monospace',
            display: 'flex',
          }}
        >
          #{proofId}
        </div>
      </div>

      {/* ── Classification pill ──────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginTop: 56,
          position: 'relative',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '10px 20px',
            borderRadius: 9999,
            background: `${classification.color}22`,
            border: `1px solid ${classification.color}55`,
            color: classification.color,
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 0.5,
          }}
        >
          {classification.label.toUpperCase()}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 14,
            color: COLORS.textMuted,
            fontFamily: 'ui-monospace',
          }}
        >
          {host}
        </div>
      </div>

      {/* ── Summary text ─────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          fontSize: 32,
          lineHeight: 1.35,
          fontWeight: 600,
          marginTop: 24,
          color: COLORS.text,
          maxWidth: 1000,
          position: 'relative',
          letterSpacing: -0.5,
        }}
      >
        {summary}
      </div>

      {/* ── Spacer pushes the chain to the bottom ─────────────── */}
      <div style={{ display: 'flex', flex: 1 }} />

      {/* ── Proof chain strip ─────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '20px 24px',
          background: COLORS.panel,
          border: `1px solid ${COLORS.edge}`,
          borderRadius: 16,
          position: 'relative',
        }}
      >
        <ChainStep
          label="TinyFish"
          detail="web analysis"
          color={COLORS.accent}
          ok={Boolean(data)}
        />
        <Divider />
        <ChainStep
          label="Grove"
          detail={ipfsOk ? 'IPFS pinned' : 'pending'}
          color={COLORS.accent}
          ok={ipfsOk}
        />
        <Divider />
        <ChainStep
          label="Hedera"
          detail={hederaOk ? 'HCS anchored' : 'pending'}
          color={COLORS.signal}
          ok={hederaOk}
        />
        <Divider />
        <ChainStep label="Arbitrum" detail="on-chain" color={COLORS.violet} ok={Boolean(data)} />
      </div>

      {/* ── Footer ───────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 24,
          fontSize: 13,
          color: COLORS.textDim,
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex' }}>lenitnes.persidian.com</div>
        <div style={{ display: 'flex' }}>{detectedAt}</div>
      </div>
    </div>,
    { ...size },
  );
}

function Divider() {
  return (
    <div
      style={{
        width: 1,
        height: 32,
        background: COLORS.edge,
        display: 'flex',
      }}
    />
  );
}

function ChainStep({
  label,
  detail,
  color,
  ok,
}: {
  label: string;
  detail: string;
  color: string;
  ok: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: 9999,
          background: ok ? color : COLORS.textDim,
          display: 'flex',
          boxShadow: ok ? `0 0 12px ${color}88` : 'none',
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 14, color: COLORS.text, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: 'ui-monospace' }}>
          {detail}
        </div>
      </div>
    </div>
  );
}
