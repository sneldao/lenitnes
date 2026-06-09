import { z } from 'zod';

export const krakenConfigSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  apiSecret: z.string().min(1, 'API secret is required'),
});

export const testTradeSchema = z.object({
  pair: z.string().optional(),
  type: z.enum(['buy', 'sell']).optional(),
  volume: z.string().optional(),
});
