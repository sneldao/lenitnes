import { z } from 'zod';

export const createMonitorSchema = z.object({
  url: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), {
      message: 'URL must use http or https scheme',
    }),
  conditionText: z.string().min(1).max(500, {
    message: 'Condition must be 500 characters or fewer to prevent token bombing',
  }),
  frequencySeconds: z.number().int().positive().default(86400),
  screenshotsEnabled: z.boolean().optional().default(true),
  isPublic: z.boolean().optional().default(true),
  confidenceThreshold: z.number().int().min(0).max(100).optional().default(50),
  assetMapping: z
    .object({
      coingeckoId: z.string().optional(),
      tokenizedStock: z.string().optional(),
      direction: z.enum(['long', 'short', 'both']).optional(),
    })
    .optional(),
});

export const patchMonitorSchema = z.object({
  frequencySeconds: z.number().int().positive().optional(),
  conditionText: z.string().min(1).max(500).optional(),
  status: z.enum(['active', 'paused']).optional(),
  isPublic: z.boolean().optional(),
  confidenceThreshold: z.number().int().min(0).max(100).optional(),
});
