#!/usr/bin/env bash
set -euo pipefail

# Reproducible deploy for lenitnes. Replaces the old rsync-single-file pattern
# with a git-checkout → compose-build → up cycle. Run from the repo root.

REF="${1:-HEAD}"

if ! git rev-parse --verify "$REF" >/dev/null 2>&1; then
  echo "fatal: '$REF' is not a valid git ref" >&2
  exit 1
fi

SHA=$(git rev-parse "$REF")
echo "deploying $SHA"

git fetch origin
git checkout "$SHA"

echo "building images..."
docker compose build --quiet

echo "starting database..."
docker compose up -d db redis
echo "waiting for database..."
for i in $(seq 1 15); do
  if docker compose exec -T db pg_isready -U "${POSTGRES_USER:-lenitnes}" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "running migrations..."
docker compose exec -T db psql -U "${POSTGRES_USER:-lenitnes}" -d "${POSTGRES_DB:-lenitnes}" < db/schema.sql

echo "starting stack..."
docker compose up -d

echo "verifying health..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:8742/health/ready >/dev/null 2>&1; then
    echo "deploy complete ($SHA)"
    exit 0
  fi
  sleep 2
done

echo "deploy failed: /health/ready did not turn green within 60s" >&2
exit 1
