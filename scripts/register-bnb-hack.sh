#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Register the LENITNES agent on-chain for the BNB Hack
# (AI Trading Agent Edition, June 22-28 live trading window).
#
# Prerequisites:
#   1. TWAK CLI installed: npm install -g @trustwallet/cli
#   2. TWAK credentials configured: twak init --api-key ... --api-secret ...
#   3. Agent wallet created: twak wallet create --password <pw>
#   4. Agent wallet funded with BSC testnet BNB (faucet below)
#
# Faucet: https://testnet.bnbchain.org/faucet-smart
#
# Usage:
#   TWAK_WALLET_PASSWORD=<pw> ./scripts/register-bnb-hack.sh
#
# Run this BEFORE June 22 (trading window opens).
# ─────────────────────────────────────────────────────────────

set -euo pipefail

echo "=== BNB Hack — On-Chain Agent Registration ==="

# Verify TWAK CLI is available
if ! command -v twak &>/dev/null && ! npx @trustwallet/cli --version &>/dev/null; then
  echo "ERROR: TWAK CLI not found. Install: npm install -g @trustwallet/cli"
  exit 1
fi

# Check wallet password
if [ -z "${TWAK_WALLET_PASSWORD:-}" ]; then
  echo "ERROR: TWAK_WALLET_PASSWORD not set"
  exit 1
fi

export TWAK_WALLET_PASSWORD

echo "1/3 Verifying TWAK auth..."
twak auth status --json || {
  echo "ERROR: TWAK not authenticated. Run: twak init --api-key ... --api-secret ..."
  exit 1
}

echo "2/3 Checking agent wallet on BSC..."
WALLET_ADDR=$(twak wallet address --chain bsc --json 2>/dev/null | grep -o '"address":"[^"]*"' | cut -d'"' -f4 || echo "")
if [ -z "$WALLET_ADDR" ]; then
  echo "Creating agent wallet..."
  twak wallet create --password "$TWAK_WALLET_PASSWORD"
  WALLET_ADDR=$(twak wallet address --chain bsc --json | grep -o '"address":"[^"]*"' | cut -d'"' -f4)
fi
echo "Agent wallet address (BSC): $WALLET_ADDR"

echo "3/3 Registering agent for BNB Hack..."
twak compete register

echo ""
echo "=== Registration complete ==="
echo "Fund your wallet at: https://testnet.bnbchain.org/faucet-smart"
echo "Wallet address: $WALLET_ADDR"
echo "Then set TWAK_ENABLED=true and X402_ENABLED=true in .env"
