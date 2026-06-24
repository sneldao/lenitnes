export interface ProofService {
  createEscrow?(monitorId: string): Promise<{ escrowAccountId: string }>;
  debitPerCheckFee?(params: {
    fromAccountId: string;
    amountHbar: number;
  }): Promise<{ hederaTxId: string | null }>;
  writeHcsMessage?(
    message: Record<string, unknown>,
  ): Promise<{ hederaTxId: string | null; topicId: string }>;
  releaseEscrow?(params: {
    toWalletAddress: string;
    amountHbar: number;
  }): Promise<{ hederaTxId: string | null }>;
  createTopic?(memo?: string): Promise<{ topicId: string }>;
}
