import {
  Client,
  PrivateKey,
  AccountId,
  Hbar,
  TransferTransaction,
  TopicMessageSubmitTransaction,
  TopicCreateTransaction,
} from "@hashgraph/sdk";
import { config } from "../config.js";

// ─────────────────────────────────────────────────────────────
// Hedera integration (Hedera Agent Kit / @hashgraph/sdk).
//
// The backend holds NO user funds. Staked HBAR lives in a per-monitor
// escrow account; the platform only debits the per-check fee and writes
// tamper-evident records to the Hedera Consensus Service (HCS).
// ─────────────────────────────────────────────────────────────

let _client: Client | null = null;

export function getClient(): Client {
  if (_client) return _client;
  const client =
    config.hedera.network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  if (config.hedera.operatorId && config.hedera.operatorKey) {
    client.setOperator(
      AccountId.fromString(config.hedera.operatorId),
      PrivateKey.fromString(config.hedera.operatorKey)
    );
  }
  _client = client;
  return client;
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

/**
 * Debit the per-check fee from a monitor's escrow to the platform treasury.
 * Returns the Hedera transaction id, used as part of the proof package.
 */
export async function debitPerCheckFee(params: {
  fromAccountId: string;
  amountHbar: number;
}): Promise<{ hederaTxId: string }> {
  const client = getClient();
  const tx = await new TransferTransaction()
    .addHbarTransfer(AccountId.fromString(params.fromAccountId), Hbar.fromTinybars(-toTinybars(params.amountHbar)))
    .addHbarTransfer(AccountId.fromString(config.hedera.treasuryId), Hbar.fromTinybars(toTinybars(params.amountHbar)))
    .execute(client);
  const receipt = await tx.getReceipt(client);
  return { hederaTxId: `${tx.transactionId.toString()}` + ` (${receipt.status.toString()})` };
}

/**
 * Write a message (heartbeat or signal record) to the platform HCS topic.
 * Returns a reference to the consensus message.
 */
export async function writeHcsMessage(message: Record<string, unknown>): Promise<{
  hederaTxId: string;
  topicId: string;
}> {
  const client = getClient();
  const topicId = config.hedera.hcsTopicId;
  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(JSON.stringify(message))
    .execute(client);
  await tx.getReceipt(client);
  return { hederaTxId: tx.transactionId.toString(), topicId };
}

/** Create a new HCS topic (used during one-time platform setup). */
export async function createTopic(memo = "LENITNES proof topic"): Promise<{ topicId: string }> {
  const client = getClient();
  const tx = await new TopicCreateTransaction().setTopicMemo(memo).execute(client);
  const receipt = await tx.getReceipt(client);
  return { topicId: receipt.topicId!.toString() };
}

/**
 * Release remaining escrow back to the user's wallet (on pause/delete).
 */
export async function releaseEscrow(params: {
  toWalletAddress: string;
  amountHbar: number;
}): Promise<{ hederaTxId: string }> {
  const client = getClient();
  const tx = await new TransferTransaction()
    .addHbarTransfer(AccountId.fromString(config.hedera.treasuryId), Hbar.fromTinybars(-toTinybars(params.amountHbar)))
    .addHbarTransfer(AccountId.fromString(params.toWalletAddress), Hbar.fromTinybars(toTinybars(params.amountHbar)))
    .execute(client);
  await tx.getReceipt(client);
  return { hederaTxId: tx.transactionId.toString() };
}

function toTinybars(hbar: number): number {
  return Math.round(hbar * 100_000_000);
}
