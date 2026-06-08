import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as kraken from '../services/kraken.js';

const apiKey = process.env.KRAKEN_API_KEY;
const apiSecret = process.env.KRAKEN_API_SECRET;

if (!apiKey || !apiSecret) {
  console.error('KRAKEN_API_KEY and KRAKEN_API_SECRET must be set');
  process.exit(1);
}

const creds: kraken.KrakenCredentials = { apiKey, apiSecret };

const server = new McpServer({
  name: 'lenitnes-kraken',
  version: '0.1.0',
});

server.tool('get_balance', 'Query account balance across all assets', {}, async () => {
  const balance = await kraken.getBalance(creds);
  return { content: [{ type: 'text', text: JSON.stringify(balance, null, 2) }] };
});

server.tool(
  'add_order',
  'Place a new order on Kraken. Supports market/limit orders with optional cancel-after timeout.',
  {
    pair: z.string().describe('Trading pair, e.g. XBTUSD'),
    type: z.enum(['buy', 'sell']).describe('Order side'),
    ordertype: z.enum(['market', 'limit']).describe('Order type'),
    volume: z.string().describe('Order volume in base currency'),
    price: z.string().optional().describe('Limit price (required for limit orders)'),
    validate: z.boolean().optional().describe('Dry-run mode — validates without placing'),
    cancelAfter: z.number().optional().describe('Auto-cancel after N seconds if not filled'),
  },
  async (args) => {
    const result = await kraken.addOrder(
      {
        pair: args.pair,
        type: args.type,
        ordertype: args.ordertype,
        volume: args.volume,
        price: args.price,
        validate: args.validate,
        cancelAfter: args.cancelAfter,
      },
      creds,
    );
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  'cancel_order',
  'Cancel one or more open orders by their Kraken transaction IDs.',
  {
    txIds: z.array(z.string()).describe('Kraken order transaction IDs to cancel'),
  },
  async ({ txIds }) => {
    const result = await kraken.cancelOrder(txIds, creds);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  'query_orders',
  'Query the status of one or more orders by their Kraken transaction IDs.',
  {
    txIds: z.array(z.string()).describe('Kraken order transaction IDs to query'),
  },
  async ({ txIds }) => {
    const orders = await kraken.queryOrders(txIds, creds);
    const mapped = Object.fromEntries(
      Object.entries(orders).map(([txid, info]) => [
        txid,
        { ...info, mappedStatus: kraken.mapKrakenStatus(info) },
      ]),
    );
    return { content: [{ type: 'text', text: JSON.stringify(mapped, null, 2) }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
