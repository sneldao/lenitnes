/**
 * Responsiveness sweep CLI — same engine as GET /backtest/responsiveness.
 *
 * Usage:
 *   MOCK_AGENT=1 npx tsx scripts/run-responsiveness-sweep.ts
 *   MOCK_AGENT=0 npx tsx scripts/run-responsiveness-sweep.ts --live --tier A
 */
import { replayWatchlistResponsiveness } from '../src/services/replay.js';
import { tierProfiles } from '../src/services/domain/repo-tiers.js';
import { resolveSweepRepos } from '../src/services/responsiveness-sweep.js';

const args = process.argv.slice(2);
const live = args.includes('--live');
const tierFilter = args.includes('--tier')
  ? (args[args.indexOf('--tier') + 1]?.toUpperCase() as 'A' | 'B' | 'C')
  : undefined;

async function main() {
  const { repos, tier } = await resolveSweepRepos({ tier: tierFilter });
  if (tier) {
    console.log(`Filtering to tier ${tier}: ${repos.map((r) => r.repo).join(', ')}\n`);
  }

  const profiles = tierProfiles(await replayWatchlistResponsiveness({ mock: !live, repos }));
  const sorted = [...profiles].sort(
    (a, b) =>
      (b.avgDirectionalT7d ?? -999) - (a.avgDirectionalT7d ?? -999) ||
      b.flaggedBatches - a.flaggedBatches,
  );

  console.log(`\nRepo responsiveness (90-day replay, ${live ? 'LIVE' : 'mock'} agent)\n`);
  console.log(
    'repo'.padEnd(30) +
      'tier'.padStart(5) +
      'flagged'.padStart(8) +
      'trade'.padStart(7) +
      'hit1d'.padStart(7) +
      'hit7d'.padStart(7) +
      'avg1d'.padStart(9) +
      'avg7d'.padStart(9),
  );
  console.log('-'.repeat(82));

  for (const p of sorted) {
    const hit1d = p.hitRateT1d != null ? `${(p.hitRateT1d * 100).toFixed(0)}%` : '—';
    const hit7d = p.hitRateT7d != null ? `${(p.hitRateT7d * 100).toFixed(0)}%` : '—';
    const avg1d = p.avgDirectionalT1d != null ? `${p.avgDirectionalT1d.toFixed(2)}%` : '—';
    const avg7d = p.avgDirectionalT7d != null ? `${p.avgDirectionalT7d.toFixed(2)}%` : '—';
    console.log(
      p.repo.padEnd(30) +
        p.tier.padStart(5) +
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
