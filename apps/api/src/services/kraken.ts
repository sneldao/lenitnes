import crypto from "node:crypto";

// ─────────────────────────────────────────────────────────────
// Kraken REST API integration.
//
// V1 supports market and limit orders via AddOrder. Per-user API keys are
// passed in decrypted (see services/crypto.ts) only at call time.
// Reference: https://docs.kraken.com/rest/  and  https://www.kraken.com/kraken-cli
// ─────────────────────────────────────────────────────────────

const KRAKEN_API_URL = "https://api.kraken.com";

export interface KrakenCredentials {
  apiKey: string;
  apiSecret: string;
}

export interface AddOrderParams {
  pair: string; // e.g. "XBTUSD"
  type: "buy" | "sell";
  ordertype: "market" | "limit";
  volume: string;
  price?: string; // required for limit
  validate?: boolean; // true => dry-run (paper trade)
}

function sign(path: string, body: string, nonce: string, secret: string): string {
  const message = path + crypto.createHash("sha256").update(nonce + body).digest("binary");
  const hmac = crypto.createHmac("sha512", Buffer.from(secret, "base64"));
  hmac.update(message, "binary");
  return hmac.digest("base64");
}

async function privateRequest(
  endpoint: string,
  params: Record<string, string>,
  creds: KrakenCredentials
): Promise<any> {
  const path = `/0/private/${endpoint}`;
  const nonce = Date.now().toString();
  const body = new URLSearchParams({ nonce, ...params }).toString();
  const signature = sign(path, body, nonce, creds.apiSecret);

  const res = await fetch(`${KRAKEN_API_URL}${path}`, {
    method: "POST",
    headers: {
      "API-Key": creds.apiKey,
      "API-Sign": signature,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = (await res.json()) as { error: string[]; result: unknown };
  if (json.error && json.error.length) {
    throw new Error(`Kraken error: ${json.error.join(", ")}`);
  }
  return json.result;
}

export async function addOrder(
  order: AddOrderParams,
  creds: KrakenCredentials
): Promise<{ krakenOrderId: string | null; raw: unknown }> {
  const params: Record<string, string> = {
    pair: order.pair,
    type: order.type,
    ordertype: order.ordertype,
    volume: order.volume,
  };
  if (order.price) params.price = order.price;
  if (order.validate) params.validate = "true";

  const result = (await privateRequest("AddOrder", params, creds)) as {
    txid?: string[];
  };
  return { krakenOrderId: result?.txid?.[0] ?? null, raw: result };
}

export async function getBalance(creds: KrakenCredentials): Promise<Record<string, string>> {
  return privateRequest("Balance", {}, creds);
}
