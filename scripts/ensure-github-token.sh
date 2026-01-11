#!/bin/bash
# Ensure GITHUB_TOKEN is properly configured on server
# This script can be run on the server directly or via SSH
# Usage (on server): bash /root/NovaCiv/scripts/ensure-github-token.sh [GITHUB_TOKEN]
# Usage (via SSH): GITHUB_TOKEN=ghp_xxxxx ssh root@77.42.36.198 "bash /root/NovaCiv/scripts/ensure-github-token.sh"

set -euo pipefail

PROJECT_DIR="/root/NovaCiv"
ENV_FILE="$PROJECT_DIR/.env"
ECO_FILE="$PROJECT_DIR/ecosystem.config.cjs"
APP_NAME="nova-ops-agent"

# Get token from argument or environment
if [ $# -gt 0 ]; then
  GITHUB_TOKEN="$1"
elif [ -n "${GITHUB_TOKEN:-}" ]; then
  # Token already in environment
  :
else
  # Try to read from .env file
  if [ -f "$ENV_FILE" ]; then
    EXISTING_TOKEN=$(grep -E "^GITHUB_TOKEN=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || echo "")
    if [ -n "$EXISTING_TOKEN" ] && [[ "$EXISTING_TOKEN" =~ ^ghp_ ]]; then
      echo "ℹ️  Found existing GITHUB_TOKEN in .env file"
      GITHUB_TOKEN="$EXISTING_TOKEN"
    else
      echo "❌ ERROR: GITHUB_TOKEN not provided and not found in .env"
      echo "   Usage: GITHUB_TOKEN=ghp_xxxxx bash $0"
      echo "   Or:    bash $0 ghp_xxxxx"
      exit 1
    fi
  else
    echo "❌ ERROR: GITHUB_TOKEN not provided and .env file not found"
    echo "   Usage: GITHUB_TOKEN=ghp_xxxxx bash $0"
    echo "   Or:    bash $0 ghp_xxxxx"
    exit 1
  fi
fi

# Validate token format
if [[ ! "$GITHUB_TOKEN" =~ ^ghp_ ]]; then
  echo "❌ ERROR: GITHUB_TOKEN should start with 'ghp_'"
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Ensuring GITHUB_TOKEN is properly configured"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd "$PROJECT_DIR"

# Ensure .env file exists
if [ ! -f "$ENV_FILE" ]; then
  echo "⚠️  .env file not found, creating it..."
  touch "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

# Backup existing .env if it exists and has content
if [ -s "$ENV_FILE" ]; then
  cp "$ENV_FILE" "${ENV_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
  echo "✅ Backed up existing .env"
fi

# Update or add GITHUB_TOKEN
if grep -qE "^GITHUB_TOKEN=" "$ENV_FILE" 2>/dev/null; then
  # Update existing token
  if [[ "$(uname)" == "Darwin" ]]; then
    # macOS
    sed -i '' "s|^GITHUB_TOKEN=.*|GITHUB_TOKEN=${GITHUB_TOKEN}|" "$ENV_FILE"
  else
    # Linux
    sed -i "s|^GITHUB_TOKEN=.*|GITHUB_TOKEN=${GITHUB_TOKEN}|" "$ENV_FILE"
  fi
  echo "✅ Updated GITHUB_TOKEN in .env"
else
  # Add new token
  echo "GITHUB_TOKEN=${GITHUB_TOKEN}" >> "$ENV_FILE"
  echo "✅ Added GITHUB_TOKEN to .env"
fi

# Verify token was written
if grep -qE "^GITHUB_TOKEN=ghp_" "$ENV_FILE"; then
  TOKEN_LEN=$(grep -E "^GITHUB_TOKEN=" "$ENV_FILE" | cut -d= -f2 | wc -c)
  echo "✅ Token verified in .env (length: $((TOKEN_LEN-1)) chars)"
else
  echo "❌ ERROR: Token verification failed"
  exit 1
fi
echo ""

# Verify ecosystem.config.cjs exists and loads .env
echo "3️⃣  Verifying ecosystem.config.cjs..."
if [ ! -f "$ECO_FILE" ]; then
  echo "❌ ERROR: ecosystem.config.cjs not found"
  exit 1
fi

# Check if ecosystem.config.cjs loads .env
if grep -q "loadEnvFile\|envFileVars\|mergedEnv" "$ECO_FILE"; then
  echo "✅ ecosystem.config.cjs loads .env variables"
else
  echo "⚠️  WARNING: ecosystem.config.cjs may not load .env variables"
fi

# Check if apps[0].env is set
if grep -q "apps\[0\].env\|env:.*mergedEnv\|env:.*envFileVars" "$ECO_FILE"; then
  echo "✅ ecosystem.config.cjs has env configuration for apps[0]"
else
  echo "⚠️  WARNING: apps[0].env may not be configured"
fi
echo ""

# Restart PM2 process with --update-env
echo "4️⃣  Restarting PM2 process with --update-env..."
if ! pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  echo "⚠️  Process $APP_NAME not found in PM2, starting it..."
  if [ -f "$ECO_FILE" ]; then
    pm2 start "$ECO_FILE" --only "$APP_NAME"
  else
    echo "❌ ERROR: Cannot start process without ecosystem.config.cjs"
    exit 1
  fi
  pm2 save
else
  echo "✅ Restarting $APP_NAME with --update-env..."
  pm2 restart "$APP_NAME" --update-env
  pm2 save
fi
echo ""

# Wait for process to start
sleep 3

# Verify token is available in process
echo "5️⃣  Verifying GITHUB_TOKEN in process environment..."
PM2_ID=$(pm2 id "$APP_NAME" 2>/dev/null | tail -n 1 | tr -d "[:space:]" || echo "")
if [ -z "$PM2_ID" ]; then
  echo "❌ ERROR: Could not find PM2 process ID for $APP_NAME"
  pm2 list
  exit 1
fi

# Check if GITHUB_TOKEN is in PM2 env
TOKEN_IN_ENV=$(pm2 env "$PM2_ID" 2>/dev/null | grep -E "^GITHUB_TOKEN=" | cut -d= -f2- || echo "")
if [ -z "$TOKEN_IN_ENV" ]; then
  echo "❌ ERROR: GITHUB_TOKEN not found in PM2 process environment"
  echo "   PM2 Process ID: $PM2_ID"
  echo "   Available env vars (first 10):"
  pm2 env "$PM2_ID" 2>/dev/null | grep -E "^[A-Z_]+" | head -n 10 || true
  exit 1
fi

TOKEN_LEN=${#TOKEN_IN_ENV}
if [ $TOKEN_LEN -lt 10 ]; then
  echo "❌ ERROR: GITHUB_TOKEN appears to be empty or too short (length: $TOKEN_LEN)"
  exit 1
fi

echo "✅ GITHUB_TOKEN found in PM2 process environment (length: $TOKEN_LEN chars)"
echo ""

# Check logs for token errors
echo "6️⃣  Checking logs for GITHUB_TOKEN errors..."
sleep 2  # Give process time to log
LOG_OUTPUT=$(pm2 logs "$APP_NAME" --lines 50 --nostream 2>&1 || echo "")

if echo "$LOG_OUTPUT" | grep -qi "GITHUB_TOKEN not set"; then
  echo "❌ ERROR: Found 'GITHUB_TOKEN not set' in logs"
  echo "   Recent log lines:"
  echo "$LOG_OUTPUT" | tail -n 20
  exit 1
elif echo "$LOG_OUTPUT" | grep -qi "GITHUB_TOKEN loaded"; then
  echo "✅ Found 'GITHUB_TOKEN loaded' message in logs"
else
  echo "⚠️  Could not find confirmation message in logs"
  echo "   Recent log lines:"
  echo "$LOG_OUTPUT" | tail -n 10
fi
echo ""

# Final status check
echo "7️⃣  Final status check..."
echo "   PM2 Status:"
pm2 list | head -n 5
echo ""
echo "   Process info:"
pm2 describe "$APP_NAME" 2>/dev/null | grep -E "(status|uptime|restarts)" || echo "   ⚠️  Could not get process info"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ GITHUB_TOKEN configuration completed successfully"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
