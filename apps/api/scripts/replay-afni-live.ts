// Live end-to-end science replay: real LLM (rubric v6) + Firecrawl literature.
// Run: npx tsx scripts/replay-afni-live.ts
import { describeReplay, replay } from '../src/services/replay.js';

const input = describeReplay({
  repo: 'afni/afni',
  from: '2015-05-01T00:00:00Z',
  to: '2015-05-14T00:00:00Z',
  domain: 'science',
});

const { verdicts, flaggedBatches } = await replay({ ...input, mock: false });
console.log('flaggedBatches:', flaggedBatches, 'scored:', verdicts.length);
for (const v of verdicts) {
  console.log(
    `\nday=${v.committedAt.slice(0, 10)} action=${v.agentScore.recommended_action} conv=${v.agentScore.conviction} rubric=${v.agentScore.rubric_version}`,
  );
  for (const d of v.detectorClassifications) {
    console.log(`   ${d.detector_type} score=${d.score} :: ${d.label}`);
  }
  console.log(`   msg: ${v.message}`);
  console.log(`   thesis: ${v.agentScore.thesis.slice(0, 300)}`);
  if (v.agentScore.literature?.length) {
    console.log(`   literature: ${v.agentScore.literature.length} ref(s)`);
    for (const l of v.agentScore.literature.slice(0, 2))
      console.log(`     - ${l.title} (${l.year}) ${l.doi ?? ''}`);
  }
}
process.exit(0);
