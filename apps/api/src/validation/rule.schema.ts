import { z } from 'zod';

export const createRuleSchema = z.object({
  monitorId: z.string().uuid(),
  actionType: z.enum(['trade', 'trade_dex', 'trade_stock', 'webhook', 'email', 'telegram']),
  actionConfig: z.record(z.string(), z.unknown()).default({}),
  conditions: z.record(z.string(), z.unknown()).default({}),
  isActive: z.boolean().default(true),
});

export const tradeConfigSchema = z.object({
  pair: z.string().min(1),
  type: z.enum(['buy', 'sell']),
  ordertype: z.enum([
    'market',
    'limit',
    'stop-loss',
    'take-profit',
    'stop-loss-limit',
    'take-profit-limit',
  ]),
  volume: z.string().min(1),
  price: z.string().optional(),
  price2: z.string().optional(),
  validate: z.boolean().optional(),
});

export const evmTradeConfigSchema = z.object({
  chain: z.enum(['arbitrum', 'robinhood']).default('arbitrum'),
  tokenIn: z.string().min(1),
  tokenOut: z.string().min(1),
  amountIn: z.string().min(1),
  slippageBps: z.number().int().min(0).max(1000).optional(),
  recipient: z.string().optional(),
});
