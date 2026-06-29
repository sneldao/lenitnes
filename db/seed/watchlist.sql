-- ─────────────────────────────────────────────────────────────
-- Seed: watchlist rows for the agent's monitors.
-- ZEC is the founding-myth asset; BTC/ETH/SOL give breadth; ARB
-- ties to the on-chain proof chain.
-- See docs/AGENT_ARCHITECTURE.md → "Cold start".
-- ─────────────────────────────────────────────────────────────

-- Unique index prevents duplicate monitors from repeated seed runs.
CREATE UNIQUE INDEX IF NOT EXISTS idx_monitors_url ON monitors (url);

INSERT INTO monitors (url, condition_text, frequency_seconds, screenshots_enabled, is_public, confidence_threshold, asset_mapping)
VALUES
  -- Release-level monitors (slow, high-signal)
  (
    'https://github.com/zcash/halo2/releases',
    'Any commit referencing a consensus-critical change, emergency patch, or mainnet-upgrade tag.',
    21600, true, true, 50,
    '{"coingeckoId": "zcash", "krakenPair": "ZECUSD", "direction": "long"}'::jsonb
  ),
  (
    'https://github.com/bitcoin/bitcoin/releases',
    'Any commit referencing a consensus-critical change, emergency patch, or soft-fork activation.',
    21600, true, true, 50,
    '{"coingeckoId": "bitcoin", "krakenPair": "XBTUSD", "direction": "long"}'::jsonb
  ),
  (
    'https://github.com/ethereum/go-ethereum/releases',
    'Any commit referencing a consensus-critical change, emergency patch, or hard-fork tag.',
    21600, true, true, 50,
    '{"coingeckoId": "ethereum", "krakenPair": "ETHUSD", "direction": "long"}'::jsonb
  ),
  (
    'https://github.com/solana-labs/solana/releases',
    'Any commit referencing a consensus-critical change, emergency patch, or mainnet-beta release.',
    21600, true, true, 50,
    '{"coingeckoId": "solana", "krakenPair": "SOLUSD", "direction": "long"}'::jsonb
  ),
  (
    'https://github.com/OffchainLabs/nitro/releases',
    'Any commit referencing a consensus-critical change, emergency patch, or mainnet-upgrade tag.',
    21600, true, true, 50,
    '{"coingeckoId": "arbitrum", "direction": "long"}'::jsonb
  ),
  -- Commit-level monitors (fast, low threshold — LLM is the real gatekeeper)
  (
    'https://github.com/bitcoin/bitcoin/commits/master',
    'Any commit referencing a consensus-critical change, emergency patch, security vulnerability fix, or soft-fork activation commit.',
    1800, true, true, 15,
    '{"coingeckoId": "bitcoin", "krakenPair": "XBTUSD", "direction": "long"}'::jsonb
  ),
  (
    'https://github.com/ethereum/go-ethereum/commits/master',
    'Any commit referencing a consensus-critical change, emergency patch, security vulnerability fix, or hard-fork activation commit.',
    1800, true, true, 15,
    '{"coingeckoId": "ethereum", "krakenPair": "ETHUSD", "direction": "long"}'::jsonb
  ),
  (
    'https://github.com/solana-labs/solana/commits/master',
    'Any commit referencing a consensus-critical change, emergency patch, security vulnerability fix, mainnet-beta release, or validator patch.',
    1800, true, true, 15,
    '{"coingeckoId": "solana", "krakenPair": "SOLUSD", "direction": "long"}'::jsonb
  ),
  (
    'https://github.com/paradigmxyz/reth/commits/main',
    'Any commit referencing a security vulnerability fix, emergency patch, consensus-critical change, or database corruption fix.',
    1800, true, true, 15,
    '{"coingeckoId": "ethereum", "direction": "long"}'::jsonb
  ),
  (
    'https://github.com/MystenLabs/sui/commits/main',
    'Any commit referencing a security vulnerability fix, emergency patch, consensus-critical change, or validator safety fix.',
    1800, true, true, 15,
    '{"coingeckoId": "sui", "krakenPair": "SUIUSD", "direction": "long"}'::jsonb
  ),
  -- Narrative-synthesis monitor (v3). Not a repo — a portfolio-wide
  -- scan that runs on its own cron (scheduler.ts). When the cluster
  -- of recent signals across all repos + SoSoValue news reaches
  -- conviction, it emits a synthesis signal under this monitor so
  -- the agent can trade a cross-repo theme even when no individual
  -- monitor crossed threshold. asset_mapping has no coingeckoId:
  -- the scan picks the dominant asset from the cluster at runtime.
  (
    'narrative:portfolio',
    'Cross-signal narrative synthesis — fires when correlated activity across multiple monitored repos and/or the SoSoValue news feed forms a tradeable theme.',
    7200, false, true, 70,
    '{"direction": "both"}'::jsonb
  )
ON CONFLICT DO NOTHING;

-- The narrative monitor is driven by its own scheduler cron
-- (runNarrativeScan), not the per-monitor queue. Mark it 'paused'
-- so dueMonitors() and scanAndEnqueue() (both filter status='active')
-- never enqueue it for a GitHub scrape. Idempotent across re-seeds.
UPDATE monitors SET status = 'paused' WHERE url = 'narrative:portfolio';
