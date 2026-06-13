'use client';

import { useState, useEffect, useRef } from 'react';
import { Terminal, Shield, Play, AlertCircle, Database, CircuitBoard } from 'lucide-react';
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
      timestamp: '1716403212.891234567',
      cid: 'bafybeig4wqhjz3qz3m3n5v4c2x3k7t6p5q4r3s2t1v0w9x8y7z6a5b4c3d2e1f',
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
      timestamp: '1716403212.891234567',
      cid: 'bafybeig4wqhjz3qz3m3n5v4c2x3k7t6p5q4r3s2t1v0w9x8y7z6a5b4c3d2e1f',
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
      timestamp: '1716403212.891234567',
      cid: 'bafybeig4wqhjz3qz3m3n5v4c2x3k7t6p5q4r3s2t1v0w9x8y7z6a5b4c3d2e1f',
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
  const [glitchActive, setGlitchActive] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);

  const selectedTarget = CURATED_TARGETS[selectedIndex];

  // Mascot mood selector
  const mascotMood = showResult ? 'alert' : isScanning ? 'scanning' : 'idle';

  // Auto-scroll terminal logs
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [currentLogs]);

  const startScan = () => {
    setIsScanning(true);
    setShowResult(false);
    setScanProgress(0);
    setCurrentLogs([]);
  };

  useEffect(() => {
    if (!isScanning) return;

    let logIndex = 0;
    const interval = setInterval(
      () => {
        if (logIndex < selectedTarget.mockLogs.length) {
          setCurrentLogs((prev) => [...prev, selectedTarget.mockLogs[logIndex]]);
          setScanProgress((prev) => Math.min(100, prev + 100 / selectedTarget.mockLogs.length));

          // Trigger glitch effect near the end
          if (logIndex === selectedTarget.mockLogs.length - 2) {
            setGlitchActive(true);
            setTimeout(() => setGlitchActive(false), 400);
          }

          logIndex++;
        } else {
          clearInterval(interval);
          // Brief pause, then show result
          setTimeout(() => {
            setIsScanning(false);
            setShowResult(true);
          }, 300);
        }
      },
      350 + Math.random() * 200,
    ); // Variable speed for realism

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
        <span className="badge bg-accent/10 text-accent">Live Simulation</span>
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
                <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-edge bg-ink/60 px-3 py-2.5 font-mono text-xs text-slate-300">
                  <CircuitBoard className="h-3 w-3 shrink-0 text-accent/60" />
                  <span className="truncate">{selectedTarget.url}</span>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Sentinel Scan Condition
                </label>
                <div
                  className={`mt-1.5 rounded-xl border px-3 py-2.5 text-xs leading-relaxed text-slate-300 transition-all ${
                    glitchActive
                      ? 'border-danger/40 bg-danger/5 animate-glitch-text'
                      : 'border-edge bg-ink/60'
                  }`}
                >
                  {selectedTarget.condition}
                </div>
              </div>
            </div>

            {/* Mascot interaction */}
            <div className="flex flex-col items-center py-4">
              <SentinelMascot size={140} mood={mascotMood} />
              <p className="mt-2 text-center text-xs font-medium text-slate-400">
                {isScanning ? (
                  <span className="text-accent animate-pulse inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                    Running simulation...
                  </span>
                ) : showResult ? (
                  <span className="text-danger font-semibold inline-flex items-center gap-1.5">
                    <AlertCircle className="h-3 w-3" />
                    Simulated match found.
                  </span>
                ) : (
                  <span>Ready to simulate target</span>
                )}
              </p>
            </div>

            <button
              onClick={startScan}
              disabled={isScanning}
              className="btn relative w-full overflow-hidden py-3 text-xs group"
            >
              {/* Shimmer on hover */}
              {!isScanning && (
                <div
                  className="pointer-events-none absolute inset-0 animate-shimmer opacity-0 group-hover:opacity-100"
                  style={{
                    background:
                      'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)',
                  }}
                />
              )}
              {isScanning ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-ink animate-pulse" />
                  Running Simulation...
                </span>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-ink" />
                  Run Simulated Evaluation
                </>
              )}
            </button>
          </div>

          {/* Terminal / Output */}
          <div className="md:col-span-7 flex flex-col border border-edge/60 bg-ink/90 rounded-xl overflow-hidden min-h-[420px]">
            {/* Terminal Header */}
            <div className="flex items-center justify-between border-b border-edge/60 bg-ink-light/80 px-4 py-2 text-xs text-slate-400 flex-shrink-0">
              <span className="flex items-center gap-1.5 font-mono">
                <Terminal className="h-3.5 w-3.5" />
                sentinel-eval-engine
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-500/80" />
                <span className="h-2 w-2 rounded-full bg-yellow-500/80" />
                <span className="h-2 w-2 rounded-full bg-green-500/80" />
              </span>
            </div>

            {/* Terminal Log Output */}
            <div
              ref={terminalRef}
              className="flex-1 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed space-y-1"
            >
              {currentLogs.length === 0 && !isScanning && !showResult && (
                <div className="flex h-full min-h-[180px] items-center justify-center text-slate-600 text-center">
                  <div className="space-y-2">
                    <Terminal className="mx-auto h-5 w-5 opacity-30" />
                    <p className="text-xs">Click &quot;Run Simulated Evaluation&quot; to begin.</p>
                  </div>
                </div>
              )}
              {currentLogs.map((log, index) => {
                const isMatch =
                  log.includes('MATCH') || log.includes('MET') || log.includes('CRITICAL');
                const isAction = log.includes('SIMULATED ACTION');
                const isWarning = log.includes('Warning') || log.includes('warning');

                // Glitch effect on the last few logs during scan
                const showGlitch = glitchActive && index >= currentLogs.length - 2;

                return (
                  <div
                    key={index}
                    className={`transition-all duration-200 ${
                      showGlitch ? 'animate-glitch-text' : ''
                    } ${isMatch ? 'text-danger font-semibold' : isAction ? 'text-signal font-medium' : isWarning ? 'text-warn' : 'text-slate-300'}`}
                    style={{ animationDelay: showGlitch ? '0s' : undefined }}
                  >
                    {/* Timestamp */}
                    <span className="text-slate-600 select-none mr-2">
                      [{String(index + 1).padStart(2, '0')}]
                    </span>
                    {log}
                  </div>
                );
              })}
              {isScanning && (
                <div className="pt-2 space-y-1.5">
                  {/* Animated dots */}
                  <div className="flex items-center gap-1 text-slate-500">
                    <span className="h-1 w-1 rounded-full bg-accent animate-pulse" />
                    <span
                      className="h-1 w-1 rounded-full bg-accent animate-pulse"
                      style={{ animationDelay: '0.2s' }}
                    />
                    <span
                      className="h-1 w-1 rounded-full bg-accent animate-pulse"
                      style={{ animationDelay: '0.4s' }}
                    />
                    <span className="ml-1 text-[10px]">Processing...</span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-1 w-full bg-edge/40 overflow-hidden rounded-full">
                    <div
                      className="h-full rounded-full transition-all duration-200 ease-out"
                      style={{
                        width: `${scanProgress}%`,
                        background: 'linear-gradient(90deg, #06b6d4, #22d3ee, #10b981)',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Results block */}
            {showResult && (
              <div className="animate-fade-slide-up border-t border-edge bg-panel/40 p-4 space-y-3 flex-shrink-0">
                {/* Alert header */}
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-danger/10">
                    <AlertCircle className="h-3.5 w-3.5 text-danger" />
                  </div>
                  <span className="text-xs font-bold text-slate-200">
                    {selectedTarget.mockResult.title}
                  </span>
                </div>

                {/* Diff display */}
                <div className="relative rounded border border-danger/20 bg-ink/90 p-2.5">
                  {/* Scan line overlay */}
                  <div
                    className="pointer-events-none absolute left-0 right-0 h-px animate-scan-line"
                    style={{
                      background:
                        'linear-gradient(90deg, transparent, rgba(239,68,68,0.3), transparent)',
                    }}
                  />
                  <pre className="font-mono text-[10px] text-red-400 overflow-x-auto whitespace-pre leading-relaxed">
                    {selectedTarget.mockResult.diff}
                  </pre>
                </div>

                {/* Proof metadata */}
                <div className="grid grid-cols-2 gap-3 text-[10px] border-t border-edge/60 pt-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-slate-500">
                      <Shield className="h-3 w-3 text-signal" />
                      <span>HCS Timestamp</span>
                    </div>
                    <span className="text-slate-200 font-mono text-[9px] block truncate">
                      {selectedTarget.mockResult.timestamp}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-slate-500">
                      <Database className="h-3 w-3 text-accent" />
                      <span>Grove CID</span>
                    </div>
                    <span className="text-accent font-mono text-[9px] block truncate">
                      {selectedTarget.mockResult.cid.slice(0, 32)}...
                    </span>
                  </div>
                </div>

                {/* Real commit link */}
                {selectedIndex === 0 && (
                  <a
                    href="https://github.com/zcash/halo2/commit/d8e48efddbe4746d76eb2c8a843a6ddc2b9a727a"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[10px] text-accent/70 hover:text-accent justify-center pt-1 transition-colors"
                  >
                    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor">
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                    </svg>
                    View the real commit on GitHub {'\u2192'}
                  </a>
                )}

                <button
                  onClick={handleActivate}
                  className="btn relative w-full overflow-hidden bg-signal text-ink hover:bg-signal-glow font-bold py-2 text-[11px] group"
                >
                  <div
                    className="pointer-events-none absolute inset-0 animate-shimmer opacity-0 group-hover:opacity-100"
                    style={{
                      background:
                        'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
                    }}
                  />
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
