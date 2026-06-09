import { z } from 'zod';

export const authSchema = z.object({
  walletAddress: z.string().min(1).max(100),
  publicKey: z.string().min(1).max(200),
  message: z
    .string()
    .min(1)
    .max(200)
    .refine((m) => m.startsWith('lenitnes:auth:'), {
      message: 'Message must be a lenitnes auth nonce',
    }),
  signature: z.string().min(1).max(500),
  email: z.string().email().optional(),
});

export const authRefreshSchema = z.object({});
