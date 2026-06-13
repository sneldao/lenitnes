#!/usr/bin/env bash
# Tail logs for all lenitnes containers, or one by name.
# Usage: ./logs.sh [api|worker|web|postgres|redis]
set -euo pipefail

SSH_HOST="${SSH_HOST:-nuncio-vultr}"
TARGET="${1:-}"

if [[ -n "$TARGET" ]]; then
  ssh "$SSH_HOST" "sudo docker logs -f --tail 50 lenitnes-${TARGET}-1 2>&1"
else
  # Show last 30 lines from each
  for svc in api worker web; do
    echo "=== $svc ==="
    ssh "$SSH_HOST" "sudo docker logs --tail 30 lenitnes-${svc}-1 2>&1" || true
    echo
  done
fi
