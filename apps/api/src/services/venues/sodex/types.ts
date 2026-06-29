export interface SodexConfig {
  apiKeyName: string;
  apiKeyPrivateKey: string;
  accountId: number;
  network: 'mainnet' | 'testnet';
}

export interface SodexOrderRequest {
  accountID: number;
  symbolID: number;
  orders: Array<{
    clOrdID: string;
    modifier: number;
    side: 0 | 1;
    type: 1 | 2;
    timeInForce: number;
    quantity: string;
    price?: string;
    funds?: string;
    stopPrice?: string;
    stopType?: number;
    triggerType?: number;
    reduceOnly: boolean;
    positionSide: number;
  }>;
}

export interface SodexOrderResponse {
  code: number;
  message: string;
  data?: {
    orderID?: string;
    clOrdID?: string;
    symbolID?: number;
    side?: number;
    price?: string;
    quantity?: string;
    status?: string;
    transactTime?: string;
  };
}

export interface SodexAccountState {
  aid: number;
  balances: Array<{
    asset: string;
    free: string;
    locked: string;
  }>;
}
