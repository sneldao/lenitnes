import { describeReplay, replay } from '../src/services/replay.js';

const input = describeReplay({
  repo: 'afni/afni',
  from: '2015-05-01T00:00:00Z',
  to: '2015-05-14T00:00:00Z',
  domain: 'science',
});
const { verdicts, flaggedBatches } = await replay({ ...input, mock: true });
console.log('flaggedBatches:', flaggedBatches);
for (const v of verdicts) {
  console.log(
    `day=${v.committedAt.slice(0, 10)} action=${v.agentScore.recommended_action} conv=${v.agentScore.conviction} rubric=${v.agentScore.rubric_version}`,
  );
  for (const d of v.detectorClassifications) {
    console.log(`   ${d.detector_type} score=${d.score} :: ${d.label}`);
  }
  console.log(`   msg: ${v.message}`);
}
console.log(
  'fix commit flagged:',
  verdicts.some(
    (v) =>
      v.hash.startsWith('2baf5710') ||
      v.detectorClassifications.some((d) => d.detector_type === 'method_fix'),
  ),
);
process.exit(0);
