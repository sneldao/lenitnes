"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

// Public-facing proof explorer for a single signal.
export default function SignalDetailPage({ params }: { params: { id: string } }) {
  const [signal, setSignal] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.getSignal(params.id).then(setSignal).catch((e) => setError(String(e)));
  }, [params.id]);

  function shareProof() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (error) return <div className="card border-danger/40 text-danger">{error}</div>;
  if (!signal) return <p className="text-slate-400">Loading proof package…</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Signal Proof</h1>
        <button className="btn-ghost" onClick={shareProof}>
          {copied ? "Copied!" : "Share proof"}
        </button>
      </div>

      <div className="card space-y-3">
        <Row label="Detected at" value={new Date(signal.detected_at).toLocaleString()} />
        <Row label="Condition" value={signal.monitor?.condition_text ?? "—"} />
        <Row label="Summary" value={signal.condition_summary ?? "—"} />
        <Row label="TinyFish run" value={signal.tinyfish_run_id ?? "—"} mono />
      </div>

      <div className="card">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Proof chain
        </h2>
        <div className="space-y-2 text-sm">
          <LinkRow label="Hedera consensus (HashScan)" href={signal.proof?.hashscanUrl} />
          <LinkRow label="IPFS proof package" href={signal.proof?.ipfsUrl} />
        </div>
      </div>

      {signal.evidence_text && (
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Evidence
          </h2>
          <pre className="overflow-auto whitespace-pre-wrap rounded-lg bg-ink p-3 text-xs text-slate-300">
            {signal.evidence_text}
          </pre>
        </div>
      )}

      {Array.isArray(signal.screenshot_urls) && signal.screenshot_urls.length > 0 && (
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Screenshots
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {signal.screenshot_urls.map((src: string, i: number) => (
              <img key={i} src={src} alt={`screenshot ${i + 1}`} className="rounded-lg border border-edge" />
            ))}
          </div>
        </div>
      )}

      {Array.isArray(signal.orders) && signal.orders.length > 0 && (
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Kraken orders
          </h2>
          {signal.orders.map((o: any) => (
            <div key={o.id} className="mb-2 rounded-lg bg-ink p-3 text-xs">
              <div>Order: {o.kraken_order_id ?? "—"}</div>
              <div>Status: {o.status}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
      <span className={mono ? "font-mono text-sm text-slate-200" : "text-sm text-slate-200"}>{value}</span>
    </div>
  );
}

function LinkRow({ label, href }: { label: string; href: string | null }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-400">{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="text-accent hover:underline">
          open ↗
        </a>
      ) : (
        <span className="text-slate-600">pending</span>
      )}
    </div>
  );
}
