import { wrapAxiosWithPaymentFromConfig } from '@x402/axios';
import { ExactEvmScheme } from '@x402/evm';
import { privateKeyToAccount } from 'viem/accounts';
import axios from 'axios';

const CMC_X402_BASE = 'https://pro.coinmarketcap.com/x402';

let x402Client: ReturnType<typeof wrapAxiosWithPaymentFromConfig> | null = null;

export function isX402Configured(): boolean {
  return !!process.env.X402_PRIVATE_KEY;
}

function getX402Client() {
  if (x402Client) return x402Client;

  const pk = process.env.X402_PRIVATE_KEY;
  if (!pk) throw new Error('X402_PRIVATE_KEY not set');

  const account = privateKeyToAccount(pk as `0x${string}`);
  const scheme = new ExactEvmScheme(account);

  const instance = axios.create({
    baseURL: CMC_X402_BASE,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    },
  });
  x402Client = wrapAxiosWithPaymentFromConfig(instance, {
    schemes: [{ network: 'eip155:8453', client: scheme }],
  });

  return x402Client;
}

export interface X402Quote {
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

export async function getQuotesX402(symbols: string[]): Promise<{
  data: X402Quote[];
  costUsd: number;
}> {
  const client = getX402Client();
  const response = await client.get('/v3/cryptocurrency/quotes/latest', {
    params: { symbol: symbols.join(',') },
  });
  const map = response.data?.data as Record<string, X402Quote> | undefined;
  const arr = map ? Object.values(map) : [];
  return { data: arr, costUsd: 0.01 };
}

export async function getGlobalMetricsX402(): Promise<{
  total_market_cap: number;
  total_volume_24h: number;
  btc_dominance: number;
  eth_dominance: number;
  fear_greed_value: number | null;
  fear_greed_classification: string | null;
  costUsd: number;
}> {
  const client = getX402Client();

  const [metricsRes, fearGreedRes] = await Promise.allSettled([
    client.get('/v3/global-metrics/quotes/latest'),
    client.get('/v3/fear-and-greed/latest'),
  ]);

  let totalCost = 0.01;
  let fearGreedValue: number | null = null;
  let fearGreedClass: string | null = null;

  if (fearGreedRes.status === 'fulfilled') {
    totalCost += 0.01;
    const fg = fearGreedRes.value.data?.data;
    fearGreedValue = fg?.value ?? null;
    fearGreedClass = fg?.value_classification ?? null;
  }

  if (metricsRes.status === 'rejected') {
    throw new Error(`x402 CMC metrics failed: ${metricsRes.reason}`);
  }

  const m = metricsRes.value.data?.data ?? {};

  return {
    total_market_cap: m.total_market_cap ?? 0,
    total_volume_24h: m.total_volume_24h ?? 0,
    btc_dominance: m.btc_dominance ?? 0,
    eth_dominance: m.eth_dominance ?? 0,
    fear_greed_value: fearGreedValue,
    fear_greed_classification: fearGreedClass,
    costUsd: totalCost,
  };
}
