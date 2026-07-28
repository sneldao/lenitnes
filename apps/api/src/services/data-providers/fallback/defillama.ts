// DefiLlama price oracle — fully keyless, generous, and speaks
// coingecko ids natively ('coingecko:zcash'). Hourly granularity for
// recent windows, daily for the 90d responsiveness sweeps. One call
// returns the entire span.

import { isCircuitOpen, recordSuccess, recordFailure } from '../../circuit.js';
import { logger } from '../../../logger.js';
import type { PricePoint } from '../types.js';

const DL_BASE = 'https://coins.llama.fi';
const TIMEOUT_MS = 12_000;
const CIRCUIT = { name: 'pf:defillama', threshold: 3, windowMs: 60_000, cooldownMs: 300_000 };

export async function fetchDefiLlamaSeries(
  coingeckoId: string,
  fromUnix: number,
  toUnix: number,
): Promise<PricePoint[] | null> {
  if (isCircuitOpen(CIRCUIT)) return null;

  const spanS = toUnix - fromUnix;
  const period = spanS <= 3 * 86400 ? '1h' : '24h';
  const periodS = spanS <= 3 * 86400 ? 3600 : 86400;
  const span = Math.max(1, Math.ceil(spanS / periodS));

  try {
    const url = `${DL_BASE}/chart/coingecko:${encodeURIComponent(coingeckoId)}?start=${fromUnix}&span=${span}&period=${period}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'lenitnes/1.0' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`defillama ${res.status}`);
    const json = (await res.json()) as {
      coins?: Record<
        string,
        { prices?: Array<{ timestamp: number; price: number }>; confidence?: number }
      >;
    };
    const series = json.coins?.[`coingecko:${coingeckoId}`]?.prices;
    if (!Array.isArray(series) || series.length === 0) {
      throw new Error('defillama: empty chart set');
    }
    recordSuccess(CIRCUIT);
    return series.map((p) => ({ timestamp: p.timestamp, price: p.price }));
  } catch (err) {
    recordFailure(CIRCUIT);
    logger.debug({ err, coingeckoId }, 'price fallback: defillama failed');
    return null;
  }
}
