#!/usr/bin/env bash
set -euo pipefail

# Reproducible deploy for lenitnes. Replaces the old rsync-single-file
# pattern with a git-checkout → compose-build → migrate → seed cycle.
#
# Usage:  bash infra/deploy.sh [ref]
#         bash infra/deploy.sh origin/main

REF="${1:-HEAD}"

if ! git rev-parse --verify "$REF" >/dev/null 2>&1; then
  echo "fatal: '$REF' is not a valid git ref" >&2
  exit 1
fi

# Use sudo for docker if the current user is not in the docker group.
DC="docker compose"
if ! docker info >/dev/null 2>&1; then
  DC="sudo docker compose"
fi

SHA=$(git rev-parse "$REF")
echo "deploying $SHA"

git fetch origin
git checkout "$SHA"

echo "building images..."
$DC build --quiet

echo "starting database..."
$DC up -d db redis
echo "waiting for database..."
for i in $(seq 1 15); do
  if $DC exec -T db pg_isready -U "${POSTGRES_USER:-lenitnes}" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "running migrations (schema.sql + 003_pivot)..."
$DC exec -T db psql -U "${POSTGRES_USER:-lenitnes}" -d "${POSTGRES_DB:-lenitnes}" < db/schema.sql
$DC exec -T db psql -U "${POSTGRES_USER:-lenitnes}" -d "${POSTGRES_DB:-lenitnes}" < db/migrations/003_pivot.sql

echo "seeding watchlist + treasury wallets..."
$DC exec -T db psql -U "${POSTGRES_USER:-lenitnes}" -d "${POSTGRES_DB:-lenitnes}" < db/seed/watchlist.sql
$DC exec -T db psql -U "${POSTGRES_USER:-lenitnes}" -d "${POSTGRES_DB:-lenitnes}" < db/seed/treasury_wallets.sql

echo "starting stack..."
$DC up -d

echo "verifying health..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:8742/health/ready >/dev/null 2>&1; then
    echo "stack up"
    break
  fi
  sleep 2
done

# Day 11: seed:demo runs the real-commits pipeline. Idempotent —
# wipes any previous DEMO: signals and re-creates them. Gives the
# public scorecard non-zero numbers on a fresh deploy.
if [[ "${SKIP_SEED_DEMO:-0}" != "1" ]]; then
  echo "seeding demo signals (3 real public commits through the real pipeline)..."
  $DC exec -T api node dist/seed/demo.js || {
    echo "warning: seed:demo failed — scorecard will be empty until re-run"
  }
fi

echo "deploy complete ($SHA)"
echo
echo "→ /scorecard"
curl -s http://localhost:8742/scorecard | python3 -m json.tool 2>/dev/null | head -30 || echo "(scorecard will populate on first signal)"
echo
echo "→ /case-study/halo2"
curl -s -o /dev/null -w "  HTTP %{http_code}\n" http://localhost:8742/case-study/halo2
echo "→ /signals"
curl -s http://localhost:8742/signals | python3 -m json.tool 2>/dev/null | head -20 || echo "(no signals yet)"
