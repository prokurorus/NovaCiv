#!/bin/bash
# NovaCiv — Audit: env sources, youtube usage, duplicates
# Run on VPS as root

set -euo pipefail

echo "=== 1) HOST / TIME ==="
hostname
date -Is
node -v || true
pm2 -v || true

echo
echo "=== 2) REPO PATHS (find NovaCiv dirs) ==="
ls -lah /root || true
ls -lah /var/www || true
find / -maxdepth 3 -type d -name "NovaCiv" 2>/dev/null | sed 's/^/DIR: /' || true

echo
echo "=== 3) ENV FILES (search) ==="
find /root /var/www -maxdepth 5 -type f \( -name ".env" -o -name ".env.*" -o -name "*.env" \) 2>/dev/null | sed 's/^/ENV: /' || true

echo
echo "=== 4) SHOW YOUTUBE ENV KEYS (masked) ==="
for f in /root/NovaCiv/.env /var/www/NovaCiv/.env; do
  if [ -f "$f" ]; then
    echo "--- $f ---"
    grep -nE '^(YOUTUBE_CLIENT_ID|YOUTUBE_CLIENT_SECRET|YOUTUBE_REFRESH_TOKEN|OPENAI_API_KEY|TELEGRAM_BOT_TOKEN)=' "$f" \
      | sed -E 's/(=).*/=\*\*\*HIDDEN\*\*\*/'
  fi
done

echo
echo "=== 5) PM2 APPS + ENV SNAPSHOT ==="
pm2 list || true
echo
pm2 describe nova-video || true
echo
pm2 env 0 2>/dev/null | sed -E 's/(YOUTUBE_CLIENT_SECRET=).*/\1***HIDDEN***/; s/(YOUTUBE_REFRESH_TOKEN=).*/\1***HIDDEN***/; s/(OPENAI_API_KEY=).*/\1***HIDDEN***/; s/(TELEGRAM_BOT_TOKEN=).*/\1***HIDDEN***/' || true

echo
echo "=== 6) CODE: where youtube is used ==="
cd /root/NovaCiv 2>/dev/null || cd /var/www/NovaCiv 2>/dev/null || { echo "NovaCiv folder not found"; exit 1; }

echo "PWD=$(pwd)"
echo
grep -RIn --exclude-dir=node_modules --exclude-dir=.git "YOUTUBE_CLIENT_ID\|YOUTUBE_REFRESH_TOKEN\|youtubeUploadEnabled\|uploadToYouTube\|oauth2.googleapis.com/token" . || true

echo
echo "=== 7) Netlify presence (functions / toml) ==="
ls -lah netlify.toml 2>/dev/null || true
find . -maxdepth 4 -type d \( -name "netlify" -o -name "functions" \) 2>/dev/null | sed 's/^/DIR: /' || true
find . -maxdepth 5 -type f \( -name "*.js" -o -name "*.ts" -o -name "*.mjs" \) 2>/dev/null | grep -iE "netlify|function|youtube|video-worker|cron" | head -20 || true

echo
echo "=== 8) Firebase feature flag (youtubeUploadEnabled) ==="
# Try both possible .env paths
ENV_PATH="/root/NovaCiv/.env"
if [ ! -f "$ENV_PATH" ] && [ -f "/var/www/NovaCiv/.env" ]; then
  ENV_PATH="/var/www/NovaCiv/.env"
fi

if [ ! -f "$ENV_PATH" ]; then
  echo "WARN: .env file not found at /root/NovaCiv/.env or /var/www/NovaCiv/.env"
  echo "Skipping Firebase check (requires .env with Firebase credentials)"
else
  export ENV_PATH="$ENV_PATH"
  set +e  # Don't exit on Node script failures (diagnostic only)
  node - <<'NODE'
const path = require('path');
const envPath = process.env.ENV_PATH || '/root/NovaCiv/.env';
try {
  require('dotenv').config({ path: envPath });
  const { getDatabase } = require('./server/config/firebase-config');
  const db = getDatabase(console);
  db.ref('config/features/youtubeUploadEnabled').once('value')
    .then(s => { console.log('youtubeUploadEnabled =', s.val()); process.exit(0); })
    .catch(e => { console.error('firebase read error:', e.message); process.exit(1); });
} catch (e) {
  console.error('Error loading Firebase config:', e.message);
  console.error('Make sure FIREBASE_SERVICE_ACCOUNT_JSON and FIREBASE_DB_URL are set in', envPath);
  process.exit(1);
}
NODE
  NODE_EXIT=$?
  set -e  # Re-enable exit on error
  if [ $NODE_EXIT -ne 0 ]; then
    echo "Firebase check failed (this is OK if Firebase not configured)"
  fi
fi

echo
echo "=== 9) Try refresh token (NO upload) ==="
# Use same ENV_PATH as section 8
if [ ! -f "$ENV_PATH" ]; then
  echo "WARN: .env file not found, skipping YouTube token test"
else
  export ENV_PATH="$ENV_PATH"
  set +e  # Don't exit on Node script failures (diagnostic only)
  node - <<'NODE'
const path = require('path');
const envPath = process.env.ENV_PATH || '/root/NovaCiv/.env';
try {
  require('dotenv').config({ path: envPath });
  const { google } = require('googleapis');

  function req(name){ const v=process.env[name]; if(!v) throw new Error('MISSING '+name); return v; }
  
  try {
    const clientId = req('YOUTUBE_CLIENT_ID');
    const clientSecret = req('YOUTUBE_CLIENT_SECRET');
    const refreshToken = req('YOUTUBE_REFRESH_TOKEN');
    
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret, 'urn:ietf:wg:oauth:2.0:oob');
    oauth2.setCredentials({ refresh_token: refreshToken });

    (async ()=>{
      try{
        const t = await oauth2.getAccessToken();
        console.log('OK: access token refreshed =', !!t.token);
        process.exit(0);
      }catch(e){
        const data = e?.response?.data;
        console.log('FAIL:', e.message);
        if (data) console.log('API:', JSON.stringify(data));
        process.exit(1);
      }
    })();
  } catch (e) {
    console.error('Missing YouTube env vars:', e.message);
    console.error('Required: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN');
    process.exit(1);
  }
} catch (e) {
  console.error('Error loading .env:', e.message);
  process.exit(1);
}
NODE
  NODE_EXIT=$?
  set -e  # Re-enable exit on error
  if [ $NODE_EXIT -ne 0 ]; then
    echo "YouTube token test failed (this is OK if YouTube not configured or token invalid)"
  fi
fi

echo
echo "=== 10) Check for duplicates (video-worker functions) ==="
echo "Checking for duplicate video worker implementations..."
find . -name "*video-worker*" -type f 2>/dev/null | grep -v node_modules | sed 's/^/FILE: /' || true
echo
echo "Checking for duplicate YouTube upload functions..."
grep -r "uploadToYouTube\|youtube\.videos\.insert" --include="*.js" --include="*.ts" . 2>/dev/null | grep -v node_modules | head -10 || true

echo
echo "=== DONE ==="
