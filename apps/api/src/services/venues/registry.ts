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
