'use client';

import { useState } from 'react';
import { FileCode, Plus, Minus, Copy, Check, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DiffFile {
  filename: string;
  additions: number;
  deletions: number;
  hunkHeader: string;
  lines: Array<{ type: 'add' | 'del' | 'ctx'; text: string; oldLine?: number; newLine?: number }>;
}

interface GitDiffInspectorProps {
  repo: string;
  commitHash: string;
  detectorType?: string;
  customDiff?: DiffFile[];
}

export function GitDiffInspector({
  repo,
  commitHash,
  detectorType = 'security_critical',
  customDiff,
}: GitDiffInspectorProps) {
  const [copied, setCopied] = useState(false);

  // Generate realistic diff payload based on repo/detector
  const diffs: DiffFile[] = customDiff || getSampleDiff(repo, detectorType);

  const copyDiff = () => {
    const raw = diffs
      .map(
        (f) =>
          `--- a/${f.filename}\n+++ b/${f.filename}\n${f.hunkHeader}\n` +
          f.lines
            .map((l) => `${l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' '}${l.text}`)
            .join('\n'),
      )
      .join('\n\n');
    navigator.clipboard.writeText(raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-edge/60 bg-ink-light/80 overflow-hidden text-xs font-mono">
      {/* Diff Inspector Header */}
      <div className="flex items-center justify-between border-b border-edge/40 bg-panel/80 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <FileCode className="h-3.5 w-3.5 text-accent" />
          <span className="text-slate-200 font-semibold text-[11px]">Git Diff Inspector</span>
          <span className="text-slate-500">({commitHash.slice(0, 7)})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyDiff}
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-accent transition-colors"
          >
            {copied ? <Check className="h-3 w-3 text-signal" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy Patch'}
          </button>
          <a
            href={`https://github.com/${repo}/commit/${commitHash}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-[10px] text-accent hover:underline"
          >
            GitHub <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Diff Files List */}
      <div className="divide-y divide-edge/30 max-h-64 overflow-y-auto">
        {diffs.map((file) => (
          <div key={file.filename} className="space-y-1">
            {/* File Sub-header */}
            <div className="flex items-center justify-between bg-panel/40 px-3 py-1.5 text-[10px] text-slate-400 border-b border-edge/20">
              <span className="text-slate-300 font-bold">{file.filename}</span>
              <div className="flex items-center gap-2 text-[9px]">
                <span className="text-signal flex items-center">
                  <Plus className="h-2.5 w-2.5" />
                  {file.additions}
                </span>
                <span className="text-danger flex items-center">
                  <Minus className="h-2.5 w-2.5" />
                  {file.deletions}
                </span>
              </div>
            </div>

            {/* Hunk Header */}
            <div className="bg-ink/40 px-3 py-1 text-[9px] text-accent/80 select-none">
              {file.hunkHeader}
            </div>

            {/* Code Lines */}
            <div className="bg-ink/60 py-1 font-mono text-[10.5px] leading-relaxed select-text overflow-x-auto">
              {file.lines.map((l, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex items-start px-3 py-0.5 whitespace-pre font-mono',
                    l.type === 'add' && 'bg-signal/10 text-signal-bright border-l-2 border-signal',
                    l.type === 'del' && 'bg-danger/10 text-danger border-l-2 border-danger',
                    l.type === 'ctx' && 'text-slate-400',
                  )}
                >
                  <span className="w-6 shrink-0 text-slate-600 text-[9px] select-none">
                    {l.oldLine ?? ' '}
                  </span>
                  <span className="w-6 shrink-0 text-slate-600 text-[9px] select-none">
                    {l.newLine ?? ' '}
                  </span>
                  <span className="w-4 shrink-0 text-center select-none">
                    {l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' '}
                  </span>
                  <span className="flex-1">{l.text}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getSampleDiff(repo: string, detector: string): DiffFile[] {
  if (repo.toLowerCase().includes('halo2')) {
    return [
      {
        filename: 'halo2_proofs/src/arithmetic/fields.rs',
        additions: 4,
        deletions: 2,
        hunkHeader: '@@ -142,8 +142,10 @@ impl<F: PrimeField> CircuitVerifier<F> {',
        lines: [
          {
            type: 'ctx',
            text: 'pub fn verify_proof_batch(&self, proof: &[u8]) -> Result<(), Error> {',
            oldLine: 142,
            newLine: 142,
          },
          {
            type: 'del',
            text: '    let scalar_check = self.eval_scalars_unchecked(proof);',
            oldLine: 143,
          },
          {
            type: 'add',
            text: '    // Security Hotfix: Enforce strict curve point validation before MSM',
            newLine: 143,
          },
          {
            type: 'add',
            text: '    let scalar_check = self.eval_scalars_checked(proof)?;',
            newLine: 144,
          },
          {
            type: 'add',
            text: '    if !scalar_check.is_valid_group_element() { return Err(Error::InvalidProof); }',
            newLine: 145,
          },
          {
            type: 'ctx',
            text: '    self.msm_accumulator.accumulate(scalar_check)',
            oldLine: 144,
            newLine: 146,
          },
        ],
      },
    ];
  }

  if (repo.toLowerCase().includes('zebra')) {
    return [
      {
        filename: 'zebra-consensus/src/parameters/consensus.rs',
        additions: 3,
        deletions: 1,
        hunkHeader: '@@ -88,4 +88,6 @@ pub enum NetworkUpgrade {',
        lines: [
          { type: 'ctx', text: '    Canopy,', oldLine: 88, newLine: 88 },
          { type: 'del', text: '    Nu5,', oldLine: 89 },
          { type: 'add', text: '    Nu5 { activation_height: Height(1687104) },', newLine: 89 },
          { type: 'add', text: '    Nu6 { activation_height: Height(2726400) },', newLine: 90 },
          { type: 'ctx', text: '}', oldLine: 90, newLine: 91 },
        ],
      },
    ];
  }

  return [
    {
      filename: 'src/consensus/validation.rs',
      additions: 2,
      deletions: 1,
      hunkHeader: '@@ -312,4 +312,5 @@ pub fn check_block_signature(block: &Block) -> bool {',
      lines: [
        {
          type: 'ctx',
          text: '    let pubkey = block.signer_pubkey();',
          oldLine: 312,
          newLine: 312,
        },
        { type: 'del', text: '    verify_sig_fast(pubkey, block.hash())', oldLine: 313 },
        {
          type: 'add',
          text: '    // Detector triggered: security critical signature verification',
          newLine: 313,
        },
        {
          type: 'add',
          text: '    verify_sig_strict(pubkey, block.hash(), SigVersion::Strict)',
          newLine: 314,
        },
      ],
    },
  ];
}
