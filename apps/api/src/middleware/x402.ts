import { paymentMiddlewareFromConfig } from '@x402/express';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { ExactHederaScheme as ExactHederaServerScheme } from '@x402/hedera/exact/server';
import { config } from '../config.js';

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

export const x402Middleware = paymentMiddlewareFromConfig(routes, facilitatorClient, [
  {
    network: config.x402.network,
    server: new ExactHederaServerScheme(),
  },
]);
