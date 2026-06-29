import type { Chain } from '@lenitnes/types';
import type { Venue, VenueName } from './types.js';

let _venues: Venue[] = [];
let _initialized = false;

export async function initVenues(): Promise<void> {
  if (_initialized) return;

  const { pancakeswapVenue } = await import('./pancakeswap/index.js');
  const venues: Venue[] = [pancakeswapVenue];

  if (process.env.SODEX_API_KEY_PRIVATE) {
    const { sodexVenue } = await import('./sodex/index.js');
    if (sodexVenue) venues.push(sodexVenue);
  }

  _venues = venues;
  _initialized = true;
}

function ensure(): Venue[] {
  if (!_initialized) {
    throw new Error('venues: not initialized — call initVenues() first');
  }
  return _venues;
}

export function getVenues(): Venue[] {
  return ensure();
}

export function getVenue(name: VenueName): Venue | undefined {
  return ensure().find((v) => v.name === name);
}

export function getVenueForChain(chain: Chain): Venue | undefined {
  return ensure().find((v) => v.isActive(chain));
}

interface VenueStatusResult {
  name: string;
  chain: string;
  active: boolean;
  configured: boolean;
}

export function getVenueStatuses(): Record<string, VenueStatusResult> {
  const allChains: Chain[] = ['hedera', 'arbitrum', 'robinhood', 'bnb', 'valuechain'];
  const result: Record<string, VenueStatusResult> = {};
  for (const v of _venues) {
    const chains = allChains.filter((c) => v.isActive(c));
    result[v.name] = {
      name: v.name,
      chain: chains.join(', '),
      active: _initialized,
      configured: true,
    };
  }
  return result;
}
