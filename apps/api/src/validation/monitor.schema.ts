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
  costPerCheck: z.number().positive().optional(),
  screenshotsEnabled: z.boolean().optional().default(true),
  isPublic: z.boolean().optional().default(true),
});

export const patchMonitorSchema = z.object({
  frequencySeconds: z.number().int().positive().optional(),
  conditionText: z.string().min(1).max(500).optional(),
  topUpHbar: z.number().positive().optional(),
  status: z.enum(['active', 'paused']).optional(),
  isPublic: z.boolean().optional(),
});
