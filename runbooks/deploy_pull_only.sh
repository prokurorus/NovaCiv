#!/bin/bash
# deploy_pull_only.sh
# Pull-only deployment script for NovaCiv server
# Usage: bash /root/NovaCiv/runbooks/deploy_pull_only.sh

set -e

echo "=== NovaCiv Pull-Only Deploy ==="
echo ""

cd /root/NovaCiv

echo "1. Fetching latest from origin..."
git fetch origin

echo "2. Resetting to origin/main..."
git reset --hard origin/main

echo "3. Restarting PM2 processes..."
pm2 restart all

echo "4. PM2 status:"
pm2 status

echo ""
echo "OK: pull-only deploy finished"
