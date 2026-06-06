import { Client, PrivateKey, AccountId } from '@hashgraph/sdk';
import { coreAccountPlugin, coreConsensusPlugin } from 'hedera-agent-kit';
import type { Tool } from 'hedera-agent-kit';
import { config } from '../config.js';

// ─────────────────────────────────────────────────────────────
// Hedera integration via Hedera Agent Kit (JS).
//
// The backend holds NO user funds. Staked HBAR lives in a per-monitor
// escrow account; the platform only debits the per-check fee and writes
// tamper-evident records to the Hedera Consensus Service (HCS).
// ─────────────────────────────────────────────────────────────

let _client: Client | null = null;
const _tools: Tool[] = [...coreAccountPlugin.tools({}), ...coreConsensusPlugin.tools({})];

export function getClient(): Client {
  if (_client) return _client;
  const client = config.hedera.network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
  if (config.hedera.operatorId && config.hedera.operatorKey) {
    client.setOperator(
      AccountId.fromString(config.hedera.operatorId),
      PrivateKey.fromString(config.hedera.operatorKey),
    );
  }
  _client = client;
  return client;
}

async function runTool(method: string, arg: unknown): Promise<string> {
  const client = getClient();
  const tool = _tools.find((t) => t.method === method);
  if (!tool) throw new Error('Invalid method ' + method);
  // hedera-agent-kit bundles its own @hashgraph/sdk copy. Both are v2.80.0
  // and structurally identical, but TypeScript sees them as different types
  // because they resolve from different node_modules paths.
  const execute = tool.execute as unknown as (
    client: Client,
    config: object,
    args: unknown,
  ) => Promise<unknown>;
  const output = await execute(client, {}, arg);
  return JSON.stringify(output);
}

/**
 * Create (or designate) an escrow holding for a new monitor.
 *
 * V1: returns the platform-managed escrow account that receives the user's
 * staked HBAR (tracked off-chain per monitor in `monitors.hbar_balance`).
 * V2: provision a dedicated Hedera account per monitor for true isolation.
 */
export async function createEscrow(_monitorId: string): Promise<{ escrowAccountId: string }> {
  // TODO: optionally create a dedicated account via AccountCreateTransaction.
  return { escrowAccountId: config.hedera.treasuryId };
}

function extractTxId(result: string): string {
  try {
    const parsed = JSON.parse(result);
    return parsed.txHash || parsed.transactionId || String(result);
  } catch {
    return String(result);
  }
}

/**
 * Debit the per-check fee from a monitor's escrow to the platform treasury.
 * Returns the Hedera transaction id, used as part of the proof package.
 */
export async function debitPerCheckFee(params: {
  fromAccountId: string;
  amountHbar: number;
}): Promise<{ hederaTxId: string }> {
  const result = await runTool(
    'transfer_hbar_tool',
    JSON.stringify({
      transfers: [
        {
          accountId: config.hedera.treasuryId,
          amount: params.amountHbar,
        },
      ],
      sourceAccountId: params.fromAccountId,
      transactionMemo: 'LENITNES check fee',
    }),
  );
  return { hederaTxId: extractTxId(result) };
}

/**
 * Write a message (heartbeat or signal record) to the platform HCS topic.
 * Returns a reference to the consensus message.
 */
export async function writeHcsMessage(message: Record<string, unknown>): Promise<{
  hederaTxId: string;
  topicId: string;
}> {
  const result = await runTool(
    'submit_topic_message_tool',
    JSON.stringify({
      topicId: config.hedera.hcsTopicId,
      message: JSON.stringify(message),
      transactionMemo: 'LENITNES signal',
    }),
  );
  return {
    hederaTxId: extractTxId(result),
    topicId: config.hedera.hcsTopicId,
  };
}

/** Create a new HCS topic (used during one-time platform setup). */
export async function createTopic(memo = 'LENITNES proof topic'): Promise<{ topicId: string }> {
  const result = await runTool(
    'create_topic_tool',
    JSON.stringify({
      topicMemo: memo,
    }),
  );
  const parsed = JSON.parse(result);
  return { topicId: parsed.topicId || String(result) };
}

/**
 * Release remaining escrow back to the user's wallet (on pause/delete).
 */
export async function releaseEscrow(params: {
  toWalletAddress: string;
  amountHbar: number;
}): Promise<{ hederaTxId: string }> {
  const result = await runTool(
    'transfer_hbar_tool',
    JSON.stringify({
      transfers: [
        {
          accountId: params.toWalletAddress,
          amount: params.amountHbar,
        },
      ],
      sourceAccountId: config.hedera.treasuryId,
      transactionMemo: 'LENITNES escrow release',
    }),
  );
  return { hederaTxId: extractTxId(result) };
}
