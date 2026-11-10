#!/usr/bin/env bash
# Deploy this checkout to a local systemd deployment.
#
#   repository: the directory this script lives in
#   target:     $HOME/maimemo-mcp by default (override with TARGET_DIR)
#
# Why this script exists: the repository and the deployment directory are two
# separate trees, and the old workflow was a hand-typed sequence of `cp` calls.
# Forgetting the copy left the service running yesterday's code while
# /healthz still reported the same version number — the failure was silent.
#
# Overridable via environment: REPO_DIR TARGET_DIR SERVICE HEALTH_URL
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
TARGET_DIR="${TARGET_DIR:-$HOME/maimemo-mcp}"
SERVICE="${SERVICE:-maimemo-mcp.service}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:9103/healthz}"
STAMP="$(date +%Y%m%d-%H%M%S)"

cd "$REPO_DIR"

echo "==> tests"
npm test

echo "==> build (repository)"
npm run build

echo "==> back up the current deployment"
for dir in src dist; do
  if [[ -d "$TARGET_DIR/$dir" ]]; then
    cp -a "$TARGET_DIR/$dir" "$TARGET_DIR/$dir.bak-$STAMP"
    echo "    $TARGET_DIR/$dir.bak-$STAMP"
  fi
done

echo "==> sync source to $TARGET_DIR"
rm -rf "$TARGET_DIR/src"
cp -r src "$TARGET_DIR/src"
cp package.json package-lock.json "$TARGET_DIR/"

echo "==> build (target)"
cd "$TARGET_DIR"
npm run build

echo "==> restart $SERVICE"
sudo systemctl restart "$SERVICE"

echo "==> health check"
for _ in $(seq 1 20); do
  if curl -sf -m 3 "$HEALTH_URL" -o /tmp/maimemo-health.json; then
    cat /tmp/maimemo-health.json
    echo
    echo "==> deployed (backup suffix: $STAMP)"
    exit 0
  fi
  sleep 0.5
done

echo "health check failed — recent service log:" >&2
sudo journalctl -u "$SERVICE" -n 30 --no-pager >&2
exit 1
