// Export utilities for backtest replay datasets (Quant & Analyst export).

export interface ScanExportVerdict {
  hash: string;
  message: string;
  committedAt: string;
  commitCount?: number;
  detectorClassifications: Array<{ detector_type: string; score: number }>;
  agentScore: {
    conviction: number;
    thesis: string;
    recommended_action: string;
  };
  priceOutcome?: {
    t1dPct: number | null;
    t7dPct: number | null;
    correct: boolean | null;
  };
}

export function exportScanDataAsJson(repo: string, verdicts: ScanExportVerdict[]) {
  const dataStr = JSON.stringify(
    {
      repository: repo,
      exportedAt: new Date().toISOString(),
      recordCount: verdicts.length,
      verdicts,
    },
    null,
    2,
  );
  downloadFile(`${repo.replace('/', '_')}_backtest_replay.json`, 'application/json', dataStr);
}

export function exportScanDataAsCsv(repo: string, verdicts: ScanExportVerdict[]) {
  const headers = [
    'committed_at',
    'commit_sha',
    'commit_message',
    'conviction_score',
    'recommended_action',
    'tripped_detectors',
    't1d_pct_outcome',
    't7d_pct_outcome',
    'call_correct',
    'thesis_summary',
  ];

  const rows = verdicts.map((v) => [
    v.committedAt,
    v.hash,
    `"${(v.message || '').replace(/"/g, '""')}"`,
    v.agentScore.conviction,
    v.agentScore.recommended_action,
    `"${v.detectorClassifications.map((c) => `${c.detector_type}:${c.score}`).join(';')}"`,
    v.priceOutcome?.t1dPct ?? '',
    v.priceOutcome?.t7dPct ?? '',
    v.priceOutcome?.correct ?? '',
    `"${(v.agentScore.thesis || '').replace(/"/g, '""')}"`,
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  downloadFile(`${repo.replace('/', '_')}_backtest_replay.csv`, 'text/csv', csvContent);
}

function downloadFile(filename: string, mimeType: string, content: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
