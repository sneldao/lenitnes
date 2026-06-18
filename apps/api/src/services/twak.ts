import { execSync, execFileSync } from 'node:child_process';
import { logger } from '../logger.js';

const TWAK_CLI = 'npx @trustwallet/cli';

let twakInitialized = false;

export function isTwakConfigured(): boolean {
  return !!(process.env.TWAK_ACCESS_ID && process.env.TWAK_HMAC_SECRET);
}

function ensureInit(): void {
  if (twakInitialized) return;
  if (!isTwakConfigured()) {
    throw new Error('TWAK not configured. Set TWAK_ACCESS_ID and TWAK_HMAC_SECRET env vars.');
  }
  // Init only once per process lifetime.
  execSync(
    `${TWAK_CLI} init --api-key "${process.env.TWAK_ACCESS_ID}" --api-secret "${process.env.TWAK_HMAC_SECRET}"`,
    { stdio: 'ignore', timeout: 15_000 },
  );
  twakInitialized = true;
}

function runTwak(args: string[]): string {
  ensureInit();
  const cmd = `${TWAK_CLI} ${args.join(' ')} --json`;
  logger.debug({ cmd }, 'twak: executing');
  return execSync(cmd, {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
}

export interface TwakSwapResult {
  txHash: string;
  amountOut: string;
  chainId: number;
}

export async function swap(
  amountIn: string,
  tokenIn: string,
  tokenOut: string,
  chain: string,
  slippagePct?: number,
): Promise<TwakSwapResult> {
  const slp = slippagePct ?? 1;
  const raw = runTwak([
    'swap',
    amountIn,
    tokenIn,
    tokenOut,
    '--chain',
    chain,
    '--slippage',
    String(slp),
  ]);
  const parsed = JSON.parse(raw);
  return {
    txHash: parsed.txHash ?? parsed.hash ?? '',
    amountOut: parsed.amountOut ?? parsed.expectedAmount ?? '',
    chainId: parsed.chainId ?? 0,
  };
}

export async function getQuoteOnly(
  amountIn: string,
  tokenIn: string,
  tokenOut: string,
  chain: string,
): Promise<{ amountOut: string; priceImpact: string }> {
  const raw = runTwak(['swap', amountIn, tokenIn, tokenOut, '--chain', chain, '--quote-only']);
  const parsed = JSON.parse(raw);
  return {
    amountOut: parsed.amountOut ?? '',
    priceImpact: parsed.priceImpact ?? '0',
  };
}

export async function walletAddress(chain: string): Promise<string> {
  const raw = runTwak(['wallet', 'address', '--chain', chain]);
  const parsed = JSON.parse(raw);
  return parsed.address ?? '';
}

export async function walletPortfolio(): Promise<Record<string, unknown>> {
  const raw = runTwak(['wallet', 'portfolio']);
  return JSON.parse(raw);
}

export async function getPrice(token: string, chain?: string): Promise<number> {
  const args = ['price', token];
  if (chain) args.push('--chain', chain);
  const raw = runTwak(args);
  const parsed = JSON.parse(raw);
  return parsed.price ?? parsed.usdPrice ?? 0;
}

export function competeRegister(): { ok: boolean; txHash?: string } {
  try {
    const raw = execSync(`${TWAK_CLI} compete register`, {
      encoding: 'utf8',
      timeout: 60_000,
    });
    logger.info({ output: raw.trim() }, 'twak: compete register succeeded');
    return { ok: true, txHash: raw.trim() };
  } catch (err) {
    logger.error({ err }, 'twak: compete register failed');
    return { ok: false };
  }
}
