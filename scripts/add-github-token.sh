#!/usr/bin/env bash

# Adds GITHUB_TOKEN to /root/NovaCiv/.env and restarts nova-ops-agent.

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "This script must be run as root." >&2
  exit 1
fi

ENV_FILE="/root/NovaCiv/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo ".env file does not exist at $ENV_FILE. Exiting." >&2
  exit 1
fi

GITHUB_TOKEN_VALUE="${1:-${GITHUB_TOKEN_INPUT:-}}"

if [ -z "$GITHUB_TOKEN_VALUE" ]; then
  echo "Missing token. Provide it as the first argument or GITHUB_TOKEN_INPUT env var." >&2
  exit 1
fi

if grep -q "^GITHUB_TOKEN=" "$ENV_FILE"; then
  echo "GITHUB_TOKEN already exists in $ENV_FILE. Exiting."
  exit 0
fi

echo "GITHUB_TOKEN=$GITHUB_TOKEN_VALUE" >> "$ENV_FILE"
echo "GITHUB_TOKEN added to $ENV_FILE."

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart nova-ops-agent
else
  echo "pm2 not found. Please restart nova-ops-agent manually." >&2
fi
