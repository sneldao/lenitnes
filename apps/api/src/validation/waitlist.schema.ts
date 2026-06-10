import { z } from 'zod';

export const waitlistSchema = z.object({
  email: z.string().email(),
  source: z.string().min(1).optional().default('web'),
});
