// ─────────────────────────────────────────────────────────────
// HCS smoke test — verifies the Hedera HCS proof path writes a
// real topic message before we trust it for a live trade.
// Day 16: the demo seed bypasses writeHcsMessage, so this path
// is un-tested in production. Run from the api workspace:
//   npx tsx scripts/smoke-hcs.ts
// ─────────────────────────────────────────────────────────────

import { config } from '../src/config.js';
import { getProofService } from '../src/services/proof.js';
import { logger } from '../src/logger.js';

async function main() {
  if (!config.hedera.operatorId || !config.hedera.operatorKey) {
    console.error('FAIL: HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY not configured');
    process.exit(1);
  }
  if (!config.hedera.hcsTopicId) {
    console.error('FAIL: HEDERA_HCS_TOPIC_ID not configured');
    process.exit(1);
  }

  const proof = getProofService();
  if (!proof.writeHcsMessage) {
    console.error('FAIL: proof service has no writeHcsMessage (proof mode may be "none")');
    process.exit(1);
  }

  const stamp = new Date().toISOString();
  const payload = {
    kind: 'smoke-test',
    ts: stamp,
    network: config.hedera.network,
    topicId: config.hedera.hcsTopicId,
    operatorId: config.hedera.operatorId,
  };

  console.log('Submitting HCS smoke-test message:');
  console.log(`  network   = ${config.hedera.network}`);
  console.log(`  topicId   = ${config.hedera.hcsTopicId}`);
  console.log(`  operator  = ${config.hedera.operatorId}`);
  console.log(`  payload   = ${JSON.stringify(payload)}`);

  const start = Date.now();
  try {
    const result = await proof.writeHcsMessage(payload);
    const ms = Date.now() - start;
    console.log(`\nOK in ${ms}ms`);
    console.log(`  hederaTxId = ${result.hederaTxId}`);
    console.log(`  topicId    = ${result.topicId ?? config.hedera.hcsTopicId}`);
    if (!result.hederaTxId) {
      console.error('FAIL: writeHcsMessage returned no txId');
      process.exit(2);
    }
    console.log('\nVerify on HashScan:');
    console.log(
      `  https://hashscan.io/${config.hedera.network === 'mainnet' ? 'mainnet' : 'testnet'}/transaction/${result.hederaTxId}`,
    );
    process.exit(0);
  } catch (err) {
    const ms = Date.now() - start;
    console.error(`\nFAIL after ${ms}ms`);
    console.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error({ err }, 'smoke-hcs: fatal');
  process.exit(1);
});
