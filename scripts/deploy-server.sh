#!/bin/bash
# scripts/deploy-server.sh
#
# One-command deployment script for NovaCiv video worker
# Run this from your PC to deploy to the server
#
# Usage:
#   bash scripts/deploy-server.sh
#
# Requirements:
#   - SSH access to server (root@77.42.36.198)
#   - SSH key configured for passwordless login

set -euo pipefail

SERVER_HOST="root@77.42.36.198"
SERVER_PATH="/root/NovaCiv"
PM2_APP_NAME="nova-video"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NovaCiv Video Worker Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Server: ${SERVER_HOST}"
echo "Path: ${SERVER_PATH}"
echo ""

# Check SSH connection
echo "1️⃣  Checking SSH connection..."
if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "${SERVER_HOST}" "echo 'SSH OK'" >/dev/null 2>&1; then
  echo "❌ Error: Cannot connect to server via SSH"
  echo "   Make sure SSH key is configured and server is reachable"
  exit 1
fi
echo "   ✅ SSH connection OK"
echo ""

# Deploy
echo "2️⃣  Deploying..."
echo "   - Pulling latest code..."
ssh "${SERVER_HOST}" "cd ${SERVER_PATH} && git pull" || {
  echo "❌ Error: git pull failed"
  exit 1
}

echo "   - Installing dependencies..."
ssh "${SERVER_HOST}" "cd ${SERVER_PATH} && npm ci" || {
  echo "❌ Error: npm ci failed"
  exit 1
}

echo "   - Restarting PM2 worker..."
ssh "${SERVER_HOST}" "cd ${SERVER_PATH} && pm2 restart ${PM2_APP_NAME} && pm2 save" || {
  echo "❌ Error: PM2 restart failed"
  exit 1
}

echo ""
echo "3️⃣  Verifying deployment..."
echo "   - Checking PM2 status..."
ssh "${SERVER_HOST}" "pm2 status ${PM2_APP_NAME}" || {
  echo "⚠️  Warning: Could not check PM2 status"
}

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Deployment complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "To view logs:"
echo "  ssh ${SERVER_HOST} 'pm2 logs ${PM2_APP_NAME}'"
echo ""
echo "To monitor in real-time:"
echo "  ssh ${SERVER_HOST} 'pm2 logs ${PM2_APP_NAME} --raw'"
echo ""


