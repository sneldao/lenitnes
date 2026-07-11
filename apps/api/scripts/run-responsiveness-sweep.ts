/**
 * One-shot responsiveness sweep — same path as GET /backtest/responsiveness.
 * Usage: MOCK_AGENT=1 npx tsx scripts/run-responsiveness-sweep.ts
 */
import { replayWatchlistResponsiveness } from '../src/services/replay.js';

async function main() {
  const profiles = await replayWatchlistResponsiveness({ mock: true });
  const sorted = [...profiles].sort(
    (a, b) =>
      (b.avgDirectionalT7d ?? -999) - (a.avgDirectionalT7d ?? -999) ||
      b.flaggedBatches - a.flaggedBatches,
  );

  console.log('\nRepo responsiveness (90-day replay, mock agent)\n');
  console.log(
    'repo'.padEnd(30) +
      'flagged'.padStart(8) +
      'trade'.padStart(7) +
      'hit1d'.padStart(7) +
      'hit7d'.padStart(7) +
      'avg1d'.padStart(9) +
      'avg7d'.padStart(9),
  );
  console.log('-'.repeat(77));

  for (const p of sorted) {
    const hit1d = p.hitRateT1d != null ? `${(p.hitRateT1d * 100).toFixed(0)}%` : '—';
    const hit7d = p.hitRateT7d != null ? `${(p.hitRateT7d * 100).toFixed(0)}%` : '—';
    const avg1d = p.avgDirectionalT1d != null ? `${p.avgDirectionalT1d.toFixed(2)}%` : '—';
    const avg7d = p.avgDirectionalT7d != null ? `${p.avgDirectionalT7d.toFixed(2)}%` : '—';
    console.log(
      p.repo.padEnd(30) +
        String(p.flaggedBatches).padStart(8) +
        String(p.tradeGradeCalls).padStart(7) +
        hit1d.padStart(7) +
        hit7d.padStart(7) +
        avg1d.padStart(9) +
        avg7d.padStart(9),
    );
  }
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
