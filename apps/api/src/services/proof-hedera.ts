import { Client, PrivateKey, AccountId } from '@hashgraph/sdk';
import { coreAccountPlugin, coreConsensusPlugin } from 'hedera-agent-kit';
import type { Tool } from 'hedera-agent-kit';
import { config } from '../config.js';
import { withRetry } from './retry.js';
import type { ProofService } from './proof-interface.js';

let _client: Client | null = null;
const _tools: Tool[] = [...coreAccountPlugin.tools({}), ...coreConsensusPlugin.tools({})];

function getClient(): Client {
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
  const execute = tool.execute as unknown as (
    client: Client,
    config: object,
    args: unknown,
  ) => Promise<unknown>;

  // The tool.execute signature in hedera-agent-kit v3+ takes a parsed
  // object, not a JSON string. The old version accepted a string;
  // passing one now triggers "Field '' - Expected object, received
  // string". We accept either at the call site (for backward compat)
  // and normalize to an object before invoking.
  const normalizedArg =
    typeof arg === 'string'
      ? (() => {
          try {
            return JSON.parse(arg) as unknown;
          } catch {
            return arg;
          }
        })()
      : arg;

  const output = await withRetry(
    async () => {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 20_000);
      try {
        return await execute(client, {}, normalizedArg);
      } finally {
        clearTimeout(timeout);
      }
    },
    { retries: 2, baseDelayMs: 1_000 },
  );
  return JSON.stringify(output);
}

function extractTxId(result: string): string {
  try {
    const parsed = JSON.parse(result);
    return parsed.txHash || parsed.transactionId || String(result);
  } catch {
    return String(result);
  }
}

export const hederaProofService: ProofService = {
  createEscrow: async (_monitorId: string) => {
    return { escrowAccountId: config.hedera.treasuryId };
  },

  debitPerCheckFee: async (params: { fromAccountId: string; amountHbar: number }) => {
    const result = await runTool(
      'transfer_hbar_tool',
      JSON.stringify({
        transfers: [{ accountId: config.hedera.treasuryId, amount: params.amountHbar }],
        sourceAccountId: params.fromAccountId,
        transactionMemo: 'LENITNES check fee',
      }),
    );
    return { hederaTxId: extractTxId(result) };
  },

  writeHcsMessage: async (message: Record<string, unknown>) => {
    const result = await runTool(
      'submit_topic_message_tool',
      JSON.stringify({
        topicId: config.hedera.hcsTopicId,
        message: JSON.stringify(message),
        transactionMemo: 'LENITNES signal',
      }),
    );
    return { hederaTxId: extractTxId(result), topicId: config.hedera.hcsTopicId };
  },

  createTopic: async (memo = 'LENITNES proof topic') => {
    const result = await runTool('create_topic_tool', JSON.stringify({ topicMemo: memo }));
    const parsed = JSON.parse(result);
    return { topicId: parsed.topicId || String(result) };
  },

  releaseEscrow: async (params: { toWalletAddress: string; amountHbar: number }) => {
    const result = await runTool(
      'transfer_hbar_tool',
      JSON.stringify({
        transfers: [{ accountId: params.toWalletAddress, amount: params.amountHbar }],
        sourceAccountId: config.hedera.treasuryId,
        transactionMemo: 'LENITNES escrow release',
      }),
    );
    return { hederaTxId: extractTxId(result) };
  },
};
