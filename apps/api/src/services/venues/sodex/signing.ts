import { ethers } from 'ethers';

// SoDEX chain IDs
export const SODEX_MAINNET_CHAIN_ID = 286623;
export const SODEX_TESTNET_CHAIN_ID = 138565;

// EIP-712 domain for spot trading
function spotDomain(network: 'mainnet' | 'testnet') {
  const chainId = network === 'mainnet' ? SODEX_MAINNET_CHAIN_ID : SODEX_TESTNET_CHAIN_ID;
  return {
    name: 'spot',
    version: '1',
    chainId,
    verifyingContract: '0x0000000000000000000000000000000000000000',
  };
}

// EIP-712 types for ExchangeAction
const EXCHANGE_ACTION_TYPES = {
  ExchangeAction: [
    { name: 'payloadHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint64' },
  ],
};

export interface ExchangeActionPayload {
  type: string;
  params: Record<string, unknown>;
}

/**
 * Compute the keccak256 hash of the compact-JSON-serialized payload.
 * JSON must be compact (no whitespace) with keys in Go struct field order.
 */
function computePayloadHash(payload: ExchangeActionPayload): string {
  const json = JSON.stringify(payload);
  return ethers.keccak256(ethers.toUtf8Bytes(json));
}

/**
 * Sign an ExchangeAction using EIP-712 typed data signing.
 * Returns the 65-byte signature with 0x01 prefix as required by SoDEX.
 */
export function signExchangeAction(
  payload: ExchangeActionPayload,
  nonce: number,
  privateKey: string,
  network: 'mainnet' | 'testnet',
): string {
  const payloadHash = computePayloadHash(payload);

  const domain = spotDomain(network);
  const value = {
    payloadHash: payloadHash as `0x${string}`,
    nonce,
  };

  const signingKey = new ethers.SigningKey(privateKey);
  const signature = signingKey.sign(
    ethers.TypedDataEncoder.encode(domain, EXCHANGE_ACTION_TYPES, value),
  );

  // EIP-712 signature is 65 bytes; prepend 0x01 per SoDEX spec
  const sigBytes = ethers.getBytes(signature.serialized);
  return '0x01' + ethers.hexlify(sigBytes).slice(2);
}

export function newOrderPayload(
  accountId: number,
  symbolId: number,
  side: 0 | 1, // 0=buy, 1=sell
  orderType: 1 | 2, // 1=limit, 2=market
  quantity: string,
  price?: string,
): ExchangeActionPayload {
  const order: Record<string, unknown> = {
    clOrdID: `lenitnes-${Date.now()}`,
    modifier: 1,
    side,
    type: orderType,
    timeInForce: 3, // GTC
    quantity,
    reduceOnly: false,
    positionSide: 1,
  };
  if (price) order.price = price;

  return {
    type: 'newOrder',
    params: {
      accountID: accountId,
      symbolID: symbolId,
      orders: [order],
    },
  };
}
