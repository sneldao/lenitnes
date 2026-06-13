import type { AssetMapping } from '@lenitnes/types';

export type Venue = 'kraken' | 'arbitrum' | 'robinhood';

export function resolveVenue(mapping: AssetMapping, preferred?: Venue): Venue {
  if (preferred) return preferred;
  if (mapping.tokenizedStock) return 'robinhood';
  if (mapping.krakenPair) return 'kraken';
  return 'arbitrum';
}
