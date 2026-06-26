import { Client, PrivateKey, AccountId } from '@hashgraph/sdk';
import { coreAccountPlugin, coreConsensusPlugin } from 'hedera-agent-kit';
import type { Tool } from 'hedera-agent-kit';
import { config } from '../config.js';
import { withRetry } from './retry.js';
import { logger } from '../logger.js';
import type { ProofService } from './proof-interface.js';

let _client: Client | null = null;
const _tools: Tool[] = [...coreAccountPlugin.tools({}), ...coreConsensusPlugin.tools({})];

// The Hedera SDK's `PrivateKey.fromString` auto-detects between
// ED25519 and ECDSA, but the heuristic gets it wrong for 32-byte
// raw keys (treats the 0x prefix as a DER signal and picks ED25519).
// For account 0.0.9137770 the on-chain key type is ECDSA_SECP256K1,
// so we have to use `fromStringECDSA` explicitly. The env var
// HEDERA_OPERATOR_KEY_TYPE allows overriding per-deploy ('ed25519'
// or 'ecdsa'). Default is 'ecdsa' because that's what current
// production accounts use.
function parseOperatorKey(raw: string): PrivateKey {
  const explicit = (config.hedera.operatorKeyType ?? 'ecdsa').toLowerCase();
  if (explicit === 'ed25519') return PrivateKey.fromStringED25519(raw);
  if (explicit === 'ecdsa') return PrivateKey.fromStringECDSA(raw);
  return PrivateKey.fromString(raw);
}

function getClient(): Client {
  if (_client) return _client;
  const client = config.hedera.network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
  if (config.hedera.operatorId && config.hedera.operatorKey) {
    const operatorKey = parseOperatorKey(config.hedera.operatorKey);
    logger.info(
      {
        operatorId: config.hedera.operatorId,
        keyType: (operatorKey as unknown as { _key?: { _type?: string } })._key?._type ?? 'unknown',
      },
      'hedera client operator set',
    );
    client.setOperator(AccountId.fromString(config.hedera.operatorId), operatorKey);
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

/** Run a tool and pull the transaction id out of the success envelope.
 *  Returns null on failure (status != "SUCCESS") so callers can store
 *  the value directly in a nullable column without polluting it with
 *  error JSON. */
async function runToolExtractTxId(method: string, arg: unknown): Promise<string | null> {
  const result = await runTool(method, arg);
  return extractTxId(result);
}

function extractTxId(result: string): string | null {
  // hedera-agent-kit returns an envelope like
  //   {"raw":{"status":"SUCCESS","transactionId":"0.0.xxx@123.456"},
  //    "humanMessage":"Message submitted successfully with transaction id 0.0.xxx@123.456"}
  // OR on failure:
  //   {"raw":{"status":{"_code":1},"error":"Failed to submit..."},
  //    "humanMessage":"Failed to submit message to topic: ..."}
  // Pull the actual transactionId from raw on SUCCESS; return null on
  // failure so the COALESCE in loop.ts keeps the column NULL rather
  // than storing an error JSON. (Storing the error was the bug that
  // made proofCoverage.withHederaHcs read 100% on the demo seed even
  // when every HCS write had failed.)
  try {
    const parsed = JSON.parse(result);
    if (parsed?.raw?.status === 'SUCCESS') {
      if (parsed.raw.transactionId) return String(parsed.raw.transactionId);
      if (typeof parsed.humanMessage === 'string') {
        const match = parsed.humanMessage.match(/0\.0\.\d+@\d+\.\d+/);
        if (match) return match[0];
      }
    }
    return null;
  } catch {
    const match = result.match(/0\.0\.\d+@\d+\.\d+/);
    return match ? match[0] : null;
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

  writeHcsMessage: async (
    message: Record<string, unknown>,
    opts?: { topicId?: string; memo?: string },
  ) => {
    const topicId = opts?.topicId ?? config.hedera.hcsTopicId;
    const txId = await runToolExtractTxId(
      'submit_topic_message_tool',
      JSON.stringify({
        topicId,
        message: JSON.stringify(message),
        transactionMemo: opts?.memo ?? 'LENITNES signal',
      }),
    );
    return { hederaTxId: txId, topicId };
  },

  createTopic: async (memo = 'LENITNES proof topic') => {
    // hedera-agent-kit's create_topic_tool returns an envelope like
    //   {"raw":{"status":"SUCCESS","topicId":"0.0.123456"},
    //    "humanMessage":"Topic created: 0.0.123456"}
    // We pull the topicId directly from the SUCCESS envelope, falling
    // back to a humanMessage regex (same belt-and-braces as extractTxId).
    const result = await runTool('create_topic_tool', JSON.stringify({ topicMemo: memo }));
    try {
      const parsed = JSON.parse(result);
      if (parsed?.raw?.status === 'SUCCESS') {
        if (parsed.raw.topicId) return { topicId: String(parsed.raw.topicId) };
        if (typeof parsed.humanMessage === 'string') {
          const match = parsed.humanMessage.match(/0\.0\.\d+/);
          if (match) return { topicId: match[0] };
        }
      }
      // Legacy fallback for older agent-kit versions that surfaced topicId
      // at the top level. Preserves behavior with v2 → v3 upgrades.
      if (parsed?.topicId) return { topicId: String(parsed.topicId) };
    } catch {
      // Fall through to raw match.
    }
    const match = result.match(/0\.0\.\d+/);
    if (match) return { topicId: match[0] };
    throw new Error(`createTopic: could not extract topicId from result: ${result.slice(0, 200)}`);
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
