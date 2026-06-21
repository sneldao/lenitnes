#!/usr/bin/env bash
# Deploy latest main to Vultr — pulls, rebuilds api+worker, restarts them.
set -euo pipefail

SSH_HOST="${SSH_HOST:-nuncio-vultr}"
REMOTE_DIR="${REMOTE_DIR:-/opt/lenitnes}"

echo "→ pulling on $SSH_HOST"
ssh "$SSH_HOST" "cd $REMOTE_DIR && git fetch origin && git checkout main && git reset --hard origin/main"

echo "→ rebuilding api + worker + web"
ssh "$SSH_HOST" "cd $REMOTE_DIR && sudo docker compose build api worker web"

echo "→ restarting containers"
ssh "$SSH_HOST" "cd $REMOTE_DIR && sudo docker compose up -d api worker web"

echo "→ health check"
sleep 3
ssh "$SSH_HOST" 'curl -sf http://localhost:8742/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost:8742/health'
