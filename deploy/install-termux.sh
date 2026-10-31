#!/usr/bin/env bash
# Install and run maimemo-mcp on an Android phone (Termux), no VPS needed.
#
#   bash install-termux.sh
#
# The server then listens on 127.0.0.1:9103 and your MCP client (RikkaHub,
# Cherry Studio, …) points at http://127.0.0.1:9103/mcp — no public exposure,
# no domain, no tunnel.
#
# Options:
#   --client-token-only   Keep the Maimemo token out of the server entirely.
#                         The server stores no credential; every client sends
#                         its own token in the Authorization header. When the
#                         token expires you only edit the client, not this
#                         device, and the server never needs restarting.
#   --print-config        Print the .env that would be written and exit,
#                         without downloading or starting anything.
#   --help                Show this message.
#
# Environment overrides:
#   MAIMEMO_PORT, MAIMEMO_HOST, MAIMEMO_BUNDLE_URL
set -euo pipefail

PORT="${MAIMEMO_PORT:-9103}"
HOST="${MAIMEMO_HOST:-127.0.0.1}"
HOME_DIR="$HOME/.maimemo-mcp"
BUNDLE_URL="${MAIMEMO_BUNDLE_URL:-https://github.com/tutu-kitty/maimemo-mcp/releases/latest/download/maimemo-mcp.cjs}"

CLIENT_TOKEN_ONLY=false
PRINT_CONFIG=false

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mxxx\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage: bash install-termux.sh [options]

  --client-token-only   Server holds no Maimemo token; each client sends its own.
  --print-config        Print the .env that would be written, then exit.
  --help                Show this help.

Environment:
  MAIMEMO_PORT, MAIMEMO_HOST, MAIMEMO_BUNDLE_URL
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --client-token-only) CLIENT_TOKEN_ONLY=true; shift ;;
    --print-config) PRINT_CONFIG=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) die "Unknown option: $1 (try --help)" ;;
  esac
done

# --- Configuration -----------------------------------------------------------
# The .env is written in one place so --print-config and the real run can
# never drift apart.
write_env() {
  if [ "$CLIENT_TOKEN_ONLY" = true ]; then
    cat <<EOF
MAIMEMO_REQUIRE_CLIENT_TOKEN=true
MAIMEMO_MCP_TRANSPORT=http
HOST=$HOST
PORT=$PORT
MAIMEMO_TOKEN_STATE_DIR=$HOME_DIR/state
EOF
  else
    cat <<EOF
MAIMEMO_API_TOKEN=$MAIMEMO_TOKEN
MAIMEMO_MCP_TRANSPORT=http
HOST=$HOST
PORT=$PORT
MAIMEMO_TOKEN_STATE_DIR=$HOME_DIR/state
EOF
  fi
}

if [ "$PRINT_CONFIG" = true ]; then
  MAIMEMO_TOKEN=""
  write_env
  exit 0
fi

# --- Termux sanity -----------------------------------------------------------
[ -n "${PREFIX:-}" ] || die "This script is for Termux on Android. Install Termux from F-Droid or GitHub, not the Play Store."
command -v node >/dev/null 2>&1 || {
  say "Installing Node.js (this takes a minute)…"
  pkg update -y && pkg install -y nodejs-lts
}

node_major=$(node -p 'process.versions.node.split(".")[0]')
[ "$node_major" -ge 20 ] || die "Node 20+ required, found $(node -v). Run: pkg upgrade nodejs-lts"

# --- Get the server ----------------------------------------------------------
mkdir -p "$HOME_DIR"
cd "$HOME_DIR"

if [ ! -f maimemo-mcp.cjs ]; then
  say "Downloading the single-file build…"
  if command -v curl >/dev/null 2>&1; then
    curl -fL "$BUNDLE_URL" -o maimemo-mcp.cjs || true
  else
    wget -q "$BUNDLE_URL" -O maimemo-mcp.cjs || true
  fi
fi

if [ ! -f maimemo-mcp.cjs ]; then
  say "No release asset yet — building from source instead (slower)."
  say "Installing Node.js dependencies…"
  npm config set registry https://registry.npmmirror.com >/dev/null 2>&1 || true
  command -v git >/dev/null 2>&1 || pkg install -y git
  # git clone refuses a non-empty target, so clone beside it and move in.
  rm -rf .build-tmp
  git clone --depth 1 https://github.com/tutu-kitty/maimemo-mcp.git .build-tmp \
    || die "Clone failed."
  cp -a .build-tmp/. .
  rm -rf .build-tmp/.git
  npm ci --no-audit --no-fund || die "npm ci failed."
  npm run build || die "Build failed."
  npm run bundle || die "Bundle failed."
fi

# --- Configure ---------------------------------------------------------------
if [ ! -f .env ]; then
  if [ "$CLIENT_TOKEN_ONLY" = true ]; then
    say "Client-token mode: the server will store no Maimemo token."
    cat <<'EOF'

    Your MCP client sends the token with every request.
    Get one in the Maimemo app: 我的 → 更多设置 → 实验功能 → 开放 API
    (Maimemo app: 更多设置 → 实验功能 → 开放 API)

EOF
    MAIMEMO_TOKEN=""
  else
    say "Getting your Maimemo token."
    cat <<'EOF'

    In the Maimemo app: 我的 → 更多设置 → 实验功能 → 开放 API
    (Maimemo app: 更多设置 → 实验功能 → 开放 API)

EOF
    printf 'Paste your token (it stays on this device): '
    read -r MAIMEMO_TOKEN
    [ -n "$MAIMEMO_TOKEN" ] || die "No token given."
  fi

  write_env > .env
  chmod 600 .env
  say "Saved to $HOME_DIR/.env (mode 600)."
fi

# Read the token back so the summary below can show the exact JSON to import.
# In client-token mode there is no server-side token, so there is nothing to read.
MAIMEMO_TOKEN=""
if [ "$CLIENT_TOKEN_ONLY" != true ]; then
  MAIMEMO_TOKEN=$(sed -n 's/^MAIMEMO_API_TOKEN=//p' "$HOME_DIR/.env" | head -1)
  [ -n "$MAIMEMO_TOKEN" ] || die "No token found in $HOME_DIR/.env"
fi

# --- Run ---------------------------------------------------------------------
cat > run.sh <<EOF
#!/usr/bin/env bash
# Start maimemo-mcp in the background and keep it alive.
cd "$HOME_DIR"
set -a; . ./.env; set +a
termux-wake-lock 2>/dev/null || true
exec node maimemo-mcp.cjs
EOF
chmod +x run.sh

say "Starting the server…"
if command -v tmux >/dev/null 2>&1; then
  tmux kill-session -t maimemo 2>/dev/null || true
  tmux new-session -d -s maimemo "$HOME_DIR/run.sh"
  say "Running in tmux session 'maimemo' (tmux attach -t maimemo to watch)."
else
  nohup "$HOME_DIR/run.sh" > "$HOME_DIR/server.log" 2>&1 &
  say "Running in the background (logs: $HOME_DIR/server.log)."
fi

sleep 2
if curl -sf "http://$HOST:$PORT/healthz" >/dev/null 2>&1; then
  say "Server is up: http://$HOST:$PORT/mcp"
else
  say "Health check did not answer. Check $HOME_DIR/server.log"
fi

# The JSON snippet differs between the two modes: with a server-side token the
# exact value can be pasted straight in; with client tokens the user has to
# fill in their own.
if [ "$CLIENT_TOKEN_ONLY" = true ]; then
  AUTH_VALUE="<your Maimemo token>"
else
  AUTH_VALUE="$MAIMEMO_TOKEN"
fi

cat <<EOF

Next: add this MCP server in your client.

  URL:     http://$HOST:$PORT/mcp      (no trailing slash)
  Header:  Authorization: Bearer <your Maimemo token>

RikkaHub can also import it directly:

{
  "mcpServers": {
    "maimemo (墨墨背单词)": {
      "type": "streamable_http",
      "url": "http://$HOST:$PORT/mcp",
      "headers": { "Authorization": "Bearer $AUTH_VALUE" }
    }
  }
}

Keep it alive:
  termux-wake-lock          # stop Android from killing Termux
  tmux attach -t maimemo    # watch the logs
  Settings → Apps → Termux → Battery → Unrestricted
EOF
