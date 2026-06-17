-- ─────────────────────────────────────────────────────────────
-- Seed: 5 watchlist rows for the agent's first week of activity.
-- ZEC is the founding-myth asset; BTC/ETH/SOL give breadth; ARB
-- ties to the on-chain proof chain.
-- See docs/AGENT_ARCHITECTURE.md → "Cold start".
-- ─────────────────────────────────────────────────────────────

INSERT INTO monitors (url, condition_text, frequency_seconds, screenshots_enabled, is_public, confidence_threshold, asset_mapping)
VALUES
  (
    'https://github.com/zcash/halo2/releases',
    'Any commit referencing a consensus-critical change, emergency patch, or mainnet-upgrade tag.',
    21600,
    true,
    true,
    50,
    '{"coingeckoId": "zcash", "krakenPair": "ZECUSD", "direction": "long"}'::jsonb
  ),
  (
    'https://github.com/bitcoin/bitcoin/releases',
    'Any commit referencing a consensus-critical change, emergency patch, or soft-fork activation.',
    21600,
    true,
    true,
    50,
    '{"coingeckoId": "bitcoin", "krakenPair": "XBTUSD", "direction": "long"}'::jsonb
  ),
  (
    'https://github.com/ethereum/go-ethereum/releases',
    'Any commit referencing a consensus-critical change, emergency patch, or hard-fork tag.',
    21600,
    true,
    true,
    50,
    '{"coingeckoId": "ethereum", "krakenPair": "ETHUSD", "direction": "long"}'::jsonb
  ),
  (
    'https://github.com/solana-labs/solana/releases',
    'Any commit referencing a consensus-critical change, emergency patch, or mainnet-beta release.',
    21600,
    true,
    true,
    50,
    '{"coingeckoId": "solana", "krakenPair": "SOLUSD", "direction": "long"}'::jsonb
  ),
  (
    'https://github.com/OffchainLabs/nitro/releases',
    'Any commit referencing a consensus-critical change, emergency patch, or mainnet-upgrade tag.',
    21600,
    true,
    true,
    50,
    '{"coingeckoId": "arbitrum", "direction": "long"}'::jsonb
  )
ON CONFLICT DO NOTHING;
