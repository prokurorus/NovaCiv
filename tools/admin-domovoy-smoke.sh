#!/bin/bash
# tools/admin-domovoy-smoke.sh
# Smoke test for VPS admin-domovoy endpoint
# Reads ADMIN_API_TOKEN from .env, tests localhost endpoint
# NEVER prints token values

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env"

# Check .env exists
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env file not found at $ENV_FILE"
  exit 1
fi

# Extract ADMIN_API_TOKEN (without printing it)
if ! grep -q "^ADMIN_API_TOKEN=" "$ENV_FILE"; then
  echo "ERROR: ADMIN_API_TOKEN not found in .env"
  exit 1
fi

# Source .env and get token (but don't print it)
export $(grep "^ADMIN_API_TOKEN=" "$ENV_FILE" | xargs)
TOKEN="$ADMIN_API_TOKEN"

if [ -z "$TOKEN" ]; then
  echo "ERROR: ADMIN_API_TOKEN is empty in .env"
  exit 1
fi

echo "OK: ADMIN_API_TOKEN found in .env"

# Test endpoint
ENDPOINT="http://127.0.0.1:3001/admin/domovoy"
BODY='{"text":"ping","history":[]}'

echo "Testing endpoint: $ENDPOINT"

# Make request and capture status + response
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: $TOKEN" \
  -d "$BODY" 2>&1)

# Extract HTTP status (last line)
HTTP_STATUS=$(echo "$RESPONSE" | tail -n 1)
RESPONSE_BODY=$(echo "$RESPONSE" | head -n -1)

# Print results (limit response to 300 chars)
echo "HTTP Status: $HTTP_STATUS"
echo "Response (first 300 chars):"
echo "$RESPONSE_BODY" | head -c 300
echo ""

# Exit with 0 if status is 200, non-zero otherwise
if [ "$HTTP_STATUS" = "200" ]; then
  echo "SUCCESS: Endpoint returned HTTP 200"
  exit 0
else
  echo "FAIL: Endpoint returned HTTP $HTTP_STATUS"
  exit 1
fi
