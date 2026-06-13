interface TokenAddresses {
  arbitrum?: string;
  robinhood?: string;
}

const TOKEN_REGISTRY: Record<string, TokenAddresses> = {
  WETH: { arbitrum: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73' },
  USDC: { arbitrum: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d' },
  TSLA: { robinhood: '0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E' },
  AMZN: { robinhood: '0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02' },
  PLTR: { robinhood: '0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0' },
  NFLX: { robinhood: '0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93' },
  AMD: { robinhood: '0x71178BAc73cBeb415514eB542a8995b82669778d' },
  USDG: { robinhood: '0x7E955252E15c84f5768B83c41a71F9eba181802F' },
};

export function resolveTokenAddress(asset: string, chain: string): string | null {
  const entry = TOKEN_REGISTRY[asset.toUpperCase()];
  if (!entry) return null;
  return (entry as Record<string, string | undefined>)[chain] ?? null;
}

export function getChainForAsset(asset: string): string | null {
  const entry = TOKEN_REGISTRY[asset.toUpperCase()];
  if (!entry) return null;
  if (entry.arbitrum) return 'arbitrum';
  if (entry.robinhood) return 'robinhood';
  return null;
}
