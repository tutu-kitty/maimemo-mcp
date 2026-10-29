#!/usr/bin/env bash
#
# One-shot deploy / update script for a fresh Linux server (Tencent Cloud CVM,
# Ubuntu 22.04+ or Debian 12+). Docker-based.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/tutu-kitty/mcp-server-maimemo/main/deploy/deploy.sh -o deploy.sh
#   chmod +x deploy.sh
#   sudo ./deploy.sh
#
# Re-running it pulls the latest code and rebuilds in place.

set -euo pipefail

REPO_URL="https://github.com/tutu-kitty/mcp-server-maimemo.git"
APP_DIR="/opt/mcp-server-maimemo"

log() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Please run as root (use sudo)."

# ---- 1. Dependencies -------------------------------------------------------
if ! command -v git >/dev/null 2>&1; then
  log "Installing git..."
  apt-get update -qq && apt-get install -y -qq git
fi

if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker..."
  # Tencent Cloud mirror keeps this fast inside mainland China.
  curl -fsSL https://get.docker.com | sh -s -- --mirror Aliyun
  systemctl enable --now docker
fi

docker compose version >/dev/null 2>&1 || die "Docker Compose v2 plugin is missing."

# ---- 2. Fetch source -------------------------------------------------------
if [[ -d "$APP_DIR/.git" ]]; then
  log "Updating existing checkout in $APP_DIR..."
  git -C "$APP_DIR" fetch --depth 1 origin main
  git -C "$APP_DIR" reset --hard origin/main
else
  log "Cloning into $APP_DIR..."
  git clone --depth 1 "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

# ---- 3. Configure ----------------------------------------------------------
if [[ ! -f .env ]]; then
  cp .env.example .env
  chmod 600 .env
  log "Created $APP_DIR/.env"

  if [[ -t 0 ]]; then
    read -rsp "Paste your Maimemo API token (input hidden): " TOKEN
    echo
    if [[ -n "$TOKEN" ]]; then
      sed -i "s|^MAIMEMO_API_TOKEN=.*|MAIMEMO_API_TOKEN=${TOKEN}|" .env
      log "Token saved to .env"
    fi
  fi
fi

grep -q '^MAIMEMO_API_TOKEN=.\+' .env \
  || log "WARNING: MAIMEMO_API_TOKEN is empty in .env. Edit it before use."

# ---- 4. Build and start ----------------------------------------------------
log "Building and starting container..."
docker compose up -d --build

# ---- 5. Verify -------------------------------------------------------------
log "Waiting for health check..."
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/healthz >/dev/null 2>&1; then
    log "Service is healthy."
    curl -s http://127.0.0.1:3000/healthz | head -c 400
    echo
    log "Done. Next: point Nginx at 127.0.0.1:3000 (see deploy/nginx.conf)."
    exit 0
  fi
  sleep 2
done

die "Service did not become healthy. Inspect logs: docker compose -f $APP_DIR/docker-compose.yml logs"
