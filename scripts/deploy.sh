#!/usr/bin/env bash
# Deploy a pinned revision to Vultr — the incremental counterpart to
# infra/deploy.sh (which bootstraps a fresh box, seeds and all).
#
#   npm run deploy                 deploy local HEAD (must be pushed)
#   npm run deploy -- <ref>        deploy a specific ref (on origin/main)
#   SKIP_MIGRATE=1 npm run deploy  skip the schema sync (emergency only)
#
# What it does:
#   1. Resolve the deploy target locally; refuse if it isn't on
#      origin/main — we never deploy code nobody has pushed.
#   2. Preflight on the server: deploy lock (flock), clean tree,
#      capture the running SHA for the rollback hint.
#   3. Reset to the pinned SHA; rebuild api/worker/web.
#   4. Sync the schema (schema.sql + db/migrations/* + positions)
#      through the postgres container — every statement is idempotent
#      and runs with ON_ERROR_STOP. The API validates the schema on
#      boot and crash-loops on mismatch, so this step is not optional.
#   5. Recreate containers, then poll /health/ready AND the web
#      container until both answer (30 × 2s).
#   6. On failure: print a paste-ready rollback to the previous SHA.
set -euo pipefail

SSH_HOST="${SSH_HOST:-nuncio-vultr}"
REMOTE_DIR="${REMOTE_DIR:-/opt/lenitnes}"
SSH_OPTS="-o BatchMode=yes -o ConnectTimeout=10"
REF="${1:-HEAD}"

# ── 1. Resolve + verify the target locally ───────────────────────
SHA="$(git rev-parse --verify "$REF" 2>/dev/null)" || {
  echo "✗ '$REF' is not a valid ref" >&2
  exit 1
}
SHORT="${SHA:0:7}"
git fetch origin --quiet
if ! git merge-base --is-ancestor "$SHA" origin/main; then
  echo "✗ $SHORT is not on origin/main — push it first" >&2
  exit 1
fi

echo "→ deploying $SHORT to $SSH_HOST ($REMOTE_DIR)"

# ── 2. Preflight: capture running SHA, refuse a dirty tree ───────
OLD="$(ssh $SSH_OPTS "$SSH_HOST" "cd $REMOTE_DIR && git rev-parse --short HEAD")"
if ! ssh $SSH_OPTS "$SSH_HOST" "cd $REMOTE_DIR && git diff --quiet && git diff --cached --quiet"; then
  echo "✗ server tree at $REMOTE_DIR is dirty — resolve on the box, then re-run" >&2
  exit 1
fi
echo "  running: $OLD → target: $SHORT"

rollback_hint() {
  cat >&2 <<HINT

✗ deploy failed — production may be partially updated.
  rollback to $OLD:
  ssh $SSH_HOST "cd $REMOTE_DIR && git reset --hard $OLD \\
    && sudo docker compose build api worker web \\
    && sudo docker compose up -d api worker web"
  (schema changes are additive — safe to keep under the old code)
HINT
}

# ── 3–5. Remote: lock → reset → build → migrate → up → verify ────
# One ssh session so the flock is held for the whole sequence; a
# concurrent deploy fails fast instead of interleaving.
set +e
ssh $SSH_OPTS "$SSH_HOST" bash -s -- "$SHA" "$REMOTE_DIR" "${SKIP_MIGRATE:-0}" <<'REMOTE'
set -euo pipefail
SHA="$1"; REMOTE_DIR="$2"; SKIP_MIGRATE="$3"
DC="sudo docker compose"

exec 9>/tmp/lenitnes-deploy.lock
flock -n 9 || { echo "✗ another deploy holds the lock" >&2; exit 1; }

cd "$REMOTE_DIR"
echo "→ checkout ${SHA:0:7}"
git fetch origin --quiet
git checkout --quiet main
git reset --hard "$SHA"

echo "→ build api worker web"
$DC build api worker web

if [ "$SKIP_MIGRATE" != "1" ]; then
  echo "→ schema sync"
  $DC up -d --wait db redis
  psql() {
    $DC exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -q -U "${POSTGRES_USER:-lenitnes}" -d "${POSTGRES_DB:-lenitnes}"'
  }
  psql < db/schema.sql
  for f in db/migrations/*.sql; do psql < "$f"; done
  psql < db/seed/positions.sql
fi

echo "→ recreate api worker web"
$DC up -d api worker web

echo "→ verify (api /health/ready + web 200)"
for i in $(seq 1 30); do
  if curl -sf -m 3 http://localhost:8742/health/ready >/dev/null 2>&1 \
     && curl -sf -m 3 -o /dev/null http://localhost:8743; then
    echo "✓ healthy after check $i"
    exit 0
  fi
  sleep 2
done
echo "✗ health checks did not pass within 60s" >&2
$DC ps api worker web >&2 || true
exit 1
REMOTE
rc=$?
set -e
if [ "$rc" -ne 0 ]; then
  rollback_hint
  exit 1
fi

# ── 6. Summary ───────────────────────────────────────────────────
echo
echo "✓ deployed $OLD → $SHORT"
ssh $SSH_OPTS "$SSH_HOST" "cd $REMOTE_DIR && sudo docker compose ps --format 'table {{.Name}}\t{{.Status}}' api worker web"
ssh $SSH_OPTS "$SSH_HOST" "curl -sf http://localhost:8742/health | python3 -m json.tool 2>/dev/null | head -12"
