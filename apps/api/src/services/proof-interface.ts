export interface ProofService {
  createEscrow?(monitorId: string): Promise<{ escrowAccountId: string }>;
  debitPerCheckFee?(params: {
    fromAccountId: string;
    amountHbar: number;
  }): Promise<{ hederaTxId: string }>;
  writeHcsMessage?(
    message: Record<string, unknown>,
  ): Promise<{ hederaTxId: string; topicId: string }>;
  releaseEscrow?(params: {
    toWalletAddress: string;
    amountHbar: number;
  }): Promise<{ hederaTxId: string }>;
  createTopic?(memo?: string): Promise<{ topicId: string }>;
}
