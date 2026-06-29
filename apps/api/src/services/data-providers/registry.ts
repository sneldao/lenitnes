import { cmcProvider } from './cmc/index.js';
import { coinGeckoProvider } from './coingecko/index.js';
import type { MarketDataProvider, PriceDataProvider } from './types.js';

export const marketData: MarketDataProvider = cmcProvider;
export const priceData: PriceDataProvider = coinGeckoProvider;

export function setMarketDataProvider(provider: MarketDataProvider): void {
  (marketData as MarketDataProvider) = provider;
}

export function setPriceDataProvider(provider: PriceDataProvider): void {
  (priceData as PriceDataProvider) = provider;
}
