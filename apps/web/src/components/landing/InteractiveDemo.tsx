'use client';

import { useState, useEffect } from 'react';
import { Terminal, Shield, Play, AlertCircle, Database } from 'lucide-react';
import SentinelMascot from './SentinelMascot';
import { useReveal } from '@/lib/useReveal';

interface CuratedTarget {
  name: string;
  url: string;
  condition: string;
  category: string;
  mockLogs: string[];
  mockResult: {
    title: string;
    details: string;
    diff: string;
    timestamp: string;
    cid: string;
  };
}

const CURATED_TARGETS: CuratedTarget[] = [
  {
    name: 'Zcash halo2 Crypto Watch',
    url: 'https://github.com/zcash/halo2/commits/main',
    condition: 'A new commit mentions verifying key change, anchor, security, or vulnerability.',
    category: 'GitHub Commits',
    mockLogs: [
      'Initializing scan on target: github.com/zcash/halo2...',
      'Retrieving latest commits from main branch...',
      'Fetched commit: d8e48efddbe4746d76eb2c8a843a6ddc2b9a727a',
      'AI Analysis: Inspecting diff for security keywords...',
      'Evaluating condition: "verifying key change, anchor, security, vulnerability"',
      'Keyword match: "verifying key" detected on line 124 of halo2/src/verifying_key.rs',
      'Keyword match: "security anchor" detected on line 87 of halo2/src/ecc.rs',
      'SIMULATED MATCH: Sentinel alert condition met.',
    ],
    mockResult: {
      title: 'Simulated alert: halo2 verifying key anchor update',
      details: 'Sample evidence package for a commit that matches the configured condition.',
      diff: '-   let key_hash = Blake2b::hash(vk.to_bytes());\n+   let key_hash = Blake2b::hash_with_personalization(vk.to_bytes(), SECURITY_ANCHOR_PERSONALIZATION);',
      timestamp: 'sample-hcs-timestamp',
      cid: 'sample-grove-cid',
    },
  },
  {
    name: 'Kraken Exchange Status',
    url: 'https://status.kraken.com',
    condition: 'Any service shows degraded performance, partial outage, or maintenance.',
    category: 'Status Page',
    mockLogs: [
      'Initializing scan on target: status.kraken.com...',
      'Parsing status page HTML structure...',
      'Service Status: API - Operations Operational',
      'Service Status: Spot Trading - Degraded Performance',
      'AI Analysis: Processing status string "Degraded Performance"...',
      'Evaluating condition: "degraded performance, partial outage, maintenance"',
      'SIMULATED MATCH: Spot Trading shows "Degraded Performance".',
      'SIMULATED ACTION: Alert rule would be queued.',
    ],
    mockResult: {
      title: 'Simulated alert: Spot Trading degraded performance',
      details: 'Sample status-page evidence package matching the configured condition.',
      diff: 'Status Page State: [Spot Trading] Operational -> Degraded Performance',
      timestamp: 'sample-hcs-timestamp',
      cid: 'sample-grove-cid',
    },
  },
  {
    name: 'SEC EDGAR Filings',
    url: 'https://www.sec.gov/cgi-bin/browse-edgar?CIK=bitcoin',
    condition: 'A new filing mentions digital assets, SEC approval, or sanctions.',
    category: 'Regulatory Feed',
    mockLogs: [
      'Initializing scan on target: sec.gov/edgar/feed...',
      'Fetching SEC RSS Atom Feed...',
      'Fetched filing: Form 8-K - ETF trust amendments',
      'AI Analysis: Inspecting filing text...',
      'Evaluating condition: "digital assets, SEC approval, sanctions"',
      'Match: "SEC approval of spot trading in digital assets" found in Section 1.01',
      'SIMULATED MATCH: Regulatory announcement detected.',
    ],
    mockResult: {
      title: 'Simulated alert: Form 8-K amendment',
      details: 'Sample filing evidence package matching digital-asset keywords.',
      diff: 'Document Excerpt: "...following the recent SEC approval, the trust will hold digital assets under custody..."',
      timestamp: 'sample-hcs-timestamp',
      cid: 'sample-grove-cid',
    },
  },
];

interface InteractiveDemoProps {
  onUseTemplate: (template: { url: string; condition: string; frequency: number }) => void;
}

export default function InteractiveDemo({ onUseTemplate }: InteractiveDemoProps) {
  const containerRef = useReveal();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [currentLogs, setCurrentLogs] = useState<string[]>([]);
  const [showResult, setShowResult] = useState(false);

  const selectedTarget = CURATED_TARGETS[selectedIndex];

  // Mascot mood selector based on current scanning state
  const mascotMood = showResult ? 'alert' : isScanning ? 'scanning' : 'idle';

  const startScan = () => {
    setIsScanning(true);
    setShowResult(false);
    setScanProgress(0);
    setCurrentLogs([]);
  };

  useEffect(() => {
    if (!isScanning) return;

    let logIndex = 0;
    const interval = setInterval(() => {
      if (logIndex < selectedTarget.mockLogs.length) {
        setCurrentLogs((prev) => [...prev, selectedTarget.mockLogs[logIndex]]);
        setScanProgress((prev) => Math.min(100, prev + 100 / selectedTarget.mockLogs.length));
        logIndex++;
      } else {
        clearInterval(interval);
        setIsScanning(false);
        setShowResult(true);
      }
    }, 450);

    return () => clearInterval(interval);
  }, [isScanning, selectedTarget]);

  const handleActivate = () => {
    onUseTemplate({
      url: selectedTarget.url,
      condition: selectedTarget.condition,
      frequency: 1800,
    });
  };

  return (
    <section ref={containerRef} className="reveal scroll-mt-24 py-16" id="demo">
      <div className="mx-auto max-w-4xl px-4 text-center">
        <span className="badge bg-accent/10 text-accent">Simulated Sandbox</span>
        <h2 className="mt-2 text-2xl font-extrabold text-white sm:text-3xl">
          See Sentinel in Action
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-400">
          Pick a target, run a simulated scan, and see how condition evaluation and proof packaging
          would work.
        </p>

        {/* Tab selection */}
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {CURATED_TARGETS.map((t, idx) => (
            <button
              key={t.name}
              onClick={() => {
                setSelectedIndex(idx);
                setIsScanning(false);
                setShowResult(false);
                setCurrentLogs([]);
              }}
              disabled={isScanning}
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition-all cursor-pointer ${
                selectedIndex === idx
                  ? 'bg-accent/15 border border-accent/40 text-accent shadow-glow-sm'
                  : 'border border-edge bg-panel/40 text-slate-400 hover:border-edge-light hover:text-slate-200'
              } disabled:opacity-40`}
            >
              {t.name}
            </button>
          ))}
        </div>

        {/* Sandbox Board */}
        <div className="mt-6 grid gap-6 rounded-2xl border border-edge/60 bg-panel/75 p-6 text-left shadow-card backdrop-blur-sm md:grid-cols-12">
          {/* Target inputs / Mascot */}
          <div className="space-y-4 md:col-span-5 flex flex-col justify-between">
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Target URL
                </label>
                <div className="mt-1.5 flex items-center rounded-xl border border-edge bg-ink/60 px-3 py-2.5 font-mono text-xs text-slate-300">
                  <span className="truncate">{selectedTarget.url}</span>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Sentinel Scan Condition
                </label>
                <div className="mt-1.5 rounded-xl border border-edge bg-ink/60 px-3 py-2.5 text-xs leading-relaxed text-slate-300">
                  {selectedTarget.condition}
                </div>
              </div>
            </div>

            {/* Mascot interaction */}
            <div className="flex flex-col items-center py-4">
              <SentinelMascot size={130} mood={mascotMood} />
              <p className="mt-2 text-center text-xs font-medium text-slate-400">
                {isScanning ? (
                  <span className="text-accent animate-pulse">Running simulation...</span>
                ) : showResult ? (
                  <span className="text-danger font-semibold">Simulated match found.</span>
                ) : (
                  <span>Ready to simulate target</span>
                )}
              </p>
            </div>

            <button onClick={startScan} disabled={isScanning} className="btn w-full py-3 text-xs">
              {isScanning ? (
                <>Running Simulation...</>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-ink" />
                  Run Simulated Evaluation
                </>
              )}
            </button>
          </div>

          {/* Terminal / Output */}
          <div className="md:col-span-7 flex flex-col min-h-[360px] border border-edge/60 bg-ink/80 rounded-xl overflow-hidden">
            {/* Terminal Header */}
            <div className="flex items-center justify-between border-b border-edge/60 bg-ink-light/80 px-4 py-2 text-xs text-slate-400">
              <span className="flex items-center gap-1.5 font-mono">
                <Terminal className="h-3.5 w-3.5" />
                sentinel-eval-engine
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-red-500/80" />
                <span className="h-2 w-2 rounded-full bg-yellow-500/80" />
                <span className="h-2 w-2 rounded-full bg-green-500/80" />
              </span>
            </div>

            {/* Terminal Log Output */}
            <div className="flex-1 p-4 font-mono text-[11px] leading-relaxed overflow-y-auto space-y-1.5 min-h-[180px]">
              {currentLogs.length === 0 && !isScanning && (
                <div className="flex h-full items-center justify-center text-slate-600 text-center">
                  <p>Click &quot;Evaluate Condition Now&quot; to begin evaluation.</p>
                </div>
              )}
              {currentLogs.map((log, index) => {
                const isMatch =
                  log.includes('MATCH') || log.includes('MET') || log.includes('CRITICAL');
                return (
                  <div
                    key={index}
                    className={`transition-opacity duration-300 ${
                      isMatch ? 'text-danger font-semibold' : 'text-slate-300'
                    }`}
                  >
                    <span className="text-slate-500 select-none">&gt; </span>
                    {log}
                  </div>
                );
              })}
              {isScanning && (
                <div className="h-1.5 w-full bg-edge/40 overflow-hidden rounded-full mt-2">
                  <div
                    className="h-full bg-accent transition-all duration-300 ease-out"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
              )}
            </div>

            {/* Results block */}
            {showResult && (
              <div className="border-t border-edge bg-panel/30 p-4 space-y-3 animate-fade-in">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-danger" />
                  <span className="text-xs font-bold text-slate-200">
                    {selectedTarget.mockResult.title}
                  </span>
                </div>
                <div className="rounded border border-edge bg-ink/90 p-2 font-mono text-[10px] text-red-400 overflow-x-auto whitespace-pre">
                  {selectedTarget.mockResult.diff}
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px] border-t border-edge/60 pt-2 text-slate-400">
                  <div className="flex items-center gap-1">
                    <Shield className="h-3 w-3 text-signal" />
                    <span>Sample HCS timestamp:</span>
                  </div>
                  <div className="text-slate-200 text-right font-mono text-[9px] truncate">
                    {selectedTarget.mockResult.timestamp}
                  </div>
                  <div className="flex items-center gap-1">
                    <Database className="h-3 w-3 text-accent" />
                    <span>Sample Grove proof:</span>
                  </div>
                  <div className="text-accent text-right font-mono text-[9px] truncate">
                    {selectedTarget.mockResult.cid}
                  </div>
                </div>
                <button
                  onClick={handleActivate}
                  className="btn w-full bg-signal text-ink hover:bg-signal-glow font-bold py-2 text-[11px]"
                >
                  Create Sentinel Monitor for this target
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
