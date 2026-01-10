#!/bin/bash
# scripts/setup-pm2-worker.sh
#
# Setup script for PM2 video worker on Linux server
# Ensures worker is configured correctly with environment variables

set -euo pipefail

APP_NAME="nova-video"
APP_SCRIPT="server/video-worker.js"
PROJECT_DIR="${1:-/root/NovaCiv}"
ENV_FILE="${2:-/root/NovaCiv/.env}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NovaCiv PM2 Video Worker Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Project Directory: $PROJECT_DIR"
echo "Env File: $ENV_FILE"
echo ""

# Check if project directory exists
if [ ! -d "$PROJECT_DIR" ]; then
  echo "❌ Error: Project directory not found: $PROJECT_DIR"
  exit 1
fi

# Check if env file exists
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Error: .env file not found: $ENV_FILE"
  echo "   Create .env file with required variables"
  exit 1
fi

# Check if worker script exists
if [ ! -f "$PROJECT_DIR/$APP_SCRIPT" ]; then
  echo "❌ Error: Worker script not found: $PROJECT_DIR/$APP_SCRIPT"
  exit 1
fi

cd "$PROJECT_DIR"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

# Stop existing process if running
echo "🛑 Stopping existing process (if any)..."
pm2 delete "$APP_NAME" 2>/dev/null || true
pm2 save

# Start worker with environment from .env file
echo "🚀 Starting worker..."
# PM2 will automatically load .env from project directory if it exists
# But we explicitly load it via the script's dotenv

pm2 start "$APP_SCRIPT" \
  --name "$APP_NAME" \
  --cwd "$PROJECT_DIR" \
  --log-date-format "YYYY-MM-DD HH:mm:ss Z" \
  --merge-logs \
  --no-autorestart

# Save PM2 process list
pm2 save

# Show status
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
pm2 status "$APP_NAME"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Useful Commands"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  View logs:           pm2 logs $APP_NAME"
echo "  View last 50 lines:  pm2 logs $APP_NAME --lines 50"
echo "  Restart worker:      pm2 restart $APP_NAME --update-env"
echo "  Stop worker:         pm2 stop $APP_NAME"
echo "  Delete worker:       pm2 delete $APP_NAME"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Important Notes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  • After changing .env variables, restart:"
echo "    pm2 restart $APP_NAME --update-env"
echo ""
echo "  • Feature flags are managed in Firebase:"
echo "    config/features/youtubeUploadEnabled"
echo "    config/features/telegramEnabled"
echo ""
echo "  • Changes to feature flags apply automatically"
echo "    (no restart needed, cache refreshes every 30s)"
echo ""
echo "✅ Setup complete!"
echo ""
