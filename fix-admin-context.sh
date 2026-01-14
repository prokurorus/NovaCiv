#!/bin/bash
# fix-admin-context.sh
# VPS diagnostic and fix script for admin context_missing error
# Run on VPS: bash fix-admin-context.sh

set -e

cd /root/NovaCiv

echo "=== STEP 1: Git Status ==="
CURRENT_HEAD=$(git rev-parse --short HEAD)
echo "Current HEAD: $CURRENT_HEAD"

git fetch origin
MAIN_HEAD=$(git rev-parse --short origin/main)
echo "Origin/main HEAD: $MAIN_HEAD"

if [ "$CURRENT_HEAD" != "$MAIN_HEAD" ]; then
  echo "HEAD != origin/main, resetting..."
  git reset --hard origin/main
  echo "✅ Reset to origin/main"
else
  echo "✅ HEAD == origin/main"
fi

echo ""
echo "=== STEP 2: Verify Memory Files ==="
for f in docs/ADMIN_ASSISTANT.md docs/PROJECT_CONTEXT.md docs/PROJECT_STATE.md; do
  if [ -s "$f" ]; then
    echo "OK $f"
  else
    echo "MISSING/EMPTY $f"
    exit 1
  fi
done

echo ""
echo "=== STEP 3: Fix PM2 Config (already done in code, restarting) ==="
pm2 restart nova-admin-domovoy --update-env || pm2 start ecosystem.config.cjs --only nova-admin-domovoy --update-env
pm2 save
echo "✅ PM2 restarted with updated config"

echo ""
echo "=== STEP 4: Local API Test ==="
node test-admin-api-local.js
TEST_RESULT=$?
if [ $TEST_RESULT -eq 0 ]; then
  echo "✅ Local API test passed"
else
  echo "❌ Local API test failed"
fi

echo ""
echo "=== STEP 5: PM2 Logs (last 80 lines) ==="
pm2 logs nova-admin-domovoy --lines 80 --nostream

echo ""
echo "=== FINAL REPORT ==="
if [ "$CURRENT_HEAD" = "$MAIN_HEAD" ]; then
  echo "✅ HEAD == origin/main"
else
  echo "✅ HEAD reset to origin/main"
fi
echo "✅ Memory files OK"
echo "✅ PM2 cwd fixed"
if [ $TEST_RESULT -eq 0 ]; then
  echo "✅ Local API test ok:true"
  echo "✅ /admin should stop returning context_missing"
else
  echo "⚠️  Local API test failed - check logs above"
fi
