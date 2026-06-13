#!/usr/bin/env bash
# Full BullMQ + Redis health snapshot — mirrors the manual checks in the README.
set -euo pipefail

SSH_HOST="${SSH_HOST:-nuncio-vultr}"

echo "=== /health (redis + api) ==="
ssh "$SSH_HOST" 'curl -s http://localhost:8742/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost:8742/health | head -c 400; echo'

echo
echo "=== /health/ready (BullMQ DLQ depth) ==="
ssh "$SSH_HOST" 'curl -s http://localhost:8742/health/ready | python3 -m json.tool 2>/dev/null || curl -s http://localhost:8742/health/ready | head -c 300; echo'

echo
echo "=== worker logs (last 90s) ==="
ssh "$SSH_HOST" 'sudo docker logs --since 90s lenitnes-worker-1 2>&1 | tail -12'

echo
echo "=== running containers ==="
ssh "$SSH_HOST" 'sudo docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"'
