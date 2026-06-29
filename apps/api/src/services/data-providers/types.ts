export interface GlobalMarketMetrics {
  totalMarketCap: number;
  totalVolume24h: number;
  btcDominance: number;
  ethDominance: number;
  defiMarketCap: number;
  derivativesVolume24h: number;
  totalFuturesOpenInterest: number;
  averageFundingRate: number;
  altcoinSeasonIndex: number | null;
  fearGreedValue: number | null;
  fearGreedClassification: string | null;
}

export interface AssetQuote {
  id: number;
  name: string;
  symbol: string;
  quote: {
    USD: {
      price: number;
      volume_24h: number;
      percent_change_1h: number;
      percent_change_24h: number;
      percent_change_7d: number;
      market_cap: number;
    };
  };
}

export interface MarketDataProvider {
  readonly name: string;
  getGlobalMetrics(): Promise<GlobalMarketMetrics | null>;
  getQuotes(symbols: string[]): Promise<AssetQuote[]>;
  formatMarketContext(metrics: GlobalMarketMetrics | null, quotes: AssetQuote[]): string;
}

export interface PricePoint {
  timestamp: number;
  price: number;
}

export interface PriceDataProvider {
  readonly name: string;
  getPriceAt(assetId: string, timestamp: Date): Promise<number | null>;
  getPriceAtWindow(
    assetId: string,
    signalTime: Date,
    windowSeconds: number,
  ): Promise<{ atSignal: number; afterWindow: number } | null>;
}
