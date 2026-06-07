import { paymentMiddlewareFromConfig } from '@x402/express';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { ExactHederaScheme as ExactHederaServerScheme } from '@x402/hedera/exact/server';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

let _middleware: ReturnType<typeof paymentMiddlewareFromConfig> | null = null;

function getMiddleware() {
  if (_middleware) return _middleware;
  const facilitatorClient = new HTTPFacilitatorClient({
    url: config.x402.facilitatorUrl,
  });
  const routes = {
    '/execute/:monitorId': {
      accepts: {
        scheme: 'exact',
        network: config.x402.network,
        payTo: config.x402.payTo,
        price: { asset: 'HBAR', amount: String(Math.round(config.x402.priceHbar * 100_000_000)) },
        maxTimeoutSeconds: 300,
      },
    },
  };
  _middleware = paymentMiddlewareFromConfig(routes, facilitatorClient, [
    {
      network: config.x402.network,
      server: new ExactHederaServerScheme(),
    },
  ]);
  return _middleware;
}

export const x402Middleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const mw = getMiddleware();
    return mw(req, res, next);
  } catch (err) {
    console.error('[x402] initialization failed:', err);
    return res.status(503).json({ error: 'payment_service_unavailable' });
  }
};
