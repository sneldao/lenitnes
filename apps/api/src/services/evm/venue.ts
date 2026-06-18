import type { AssetMapping } from '@lenitnes/types';

export type Venue = 'arbitrum' | 'robinhood';

export function resolveVenue(mapping: AssetMapping, preferred?: Venue): Venue {
  if (preferred) return preferred;
  if (mapping.tokenizedStock) return 'robinhood';
  return 'arbitrum';
}
