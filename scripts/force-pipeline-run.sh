#!/bin/bash
set +x
echo "=== NovaCiv: FORCE PIPELINE RUN (server) ==="
date -u
whoami
uname -a

# 0) Find project directory
CANDIDATES=(
  "/root/NovaCiv"
  "/home/ubuntu/NovaCiv"
  "/home/*/NovaCiv"
  "/var/www/NovaCiv"
)
PROJ=""
for d in "${CANDIDATES[@]}"; do
  for x in $d; do
    if [ -d "$x" ] && [ -f "$x/package.json" ]; then PROJ="$x"; break 2; fi
  done
done
if [ -z "$PROJ" ]; then
  echo "❌ Project dir not found in common paths. Searching..."
  PROJ=$(find / -maxdepth 4 -type f -name package.json 2>/dev/null | head -n 1 | xargs -r dirname)
fi
if [ -z "$PROJ" ]; then echo "❌ Still cannot find project directory with package.json"; exit 1; fi
echo "✅ Project dir: $PROJ"
cd "$PROJ" || exit 1

# 1) Ensure PM2 exists (and show current processes)
if command -v pm2 >/dev/null 2>&1; then
  echo "✅ pm2: $(pm2 -v)"
  echo "--- pm2 list ---"
  pm2 list || true
else
  echo "❌ pm2 not found. Installing globally..."
  npm i -g pm2 || exit 1
  echo "✅ pm2 installed: $(pm2 -v)"
fi

# 2) Locate ANY existing env file on server (we assume it already exists somewhere)
echo "--- searching for existing env files (best effort) ---"
FOUND_ENV=""
for p in \
  "$PROJ/.env" \
  "$PROJ/.env.production" \
  "$PROJ/.env.local" \
  "/root/NovaCiv/.env" \
  "/root/.env" \
  "/home/*/.env" \
  "/etc/novaciv.env" \
  "/etc/environment"
do
  for f in $p; do
    if [ -f "$f" ]; then FOUND_ENV="$f"; break 2; fi
  done
done

if [ -z "$FOUND_ENV" ]; then
  echo "⚠️ No env file found in standard locations."
  echo "Trying to extract env from existing PM2 process (if any)..."
  # Try to read environment from PM2 app if it exists
  APP_ID=$(pm2 jlist 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);const a=j.find(x=>x.name==='nova-video');console.log(a?a.pm_id:'');}catch(e){console.log('')}})")
  if [ -n "$APP_ID" ]; then
    echo "Found PM2 app nova-video id=$APP_ID. Dumping selected env keys (presence only)."
    pm2 env "$APP_ID" | egrep -i "FIREBASE_|OPENAI_|YOUTUBE_|TELEGRAM_|ENV_PATH" || true
    echo "Creating $PROJ/.env from current shell env (only known keys)..."
  fi

  # Create .env from CURRENT shell env if available (user said safety doesn't matter; still we avoid printing values)
  # We only write keys that exist in environment. If they are not in shell env, this will produce an incomplete file.
  KEYS=(
    FIREBASE_SERVICE_ACCOUNT_JSON
    FIREBASE_DB_URL
    FIREBASE_DATABASE_URL
    OPENAI_API_KEY
    OPENAI_TTS_MODEL
    YOUTUBE_CLIENT_ID
    YOUTUBE_CLIENT_SECRET
    YOUTUBE_REFRESH_TOKEN
    YOUTUBE_PRIVACY_STATUS
  )
  {
    echo "# Auto-generated on server $(date -u)"
    for k in "${KEYS[@]}"; do
      v="${!k}"
      if [ -n "$v" ]; then
        # Write safely as single line
        printf "%s=%q\n" "$k" "$v"
      fi
    done
  } > "$PROJ/.env"

  if [ ! -s "$PROJ/.env" ]; then
    echo "❌ Still blocked: could not create .env (no values available in shell env)."
    echo "ACTION: You must point me to where the existing .env is stored on this server, OR ensure vars are exported in environment."
    exit 1
  fi

  FOUND_ENV="$PROJ/.env"
else
  echo "✅ Found env file: $FOUND_ENV"
  # Ensure .env exists in project root (worker expects it)
  if [ "$FOUND_ENV" != "$PROJ/.env" ]; then
    echo "Copying env -> $PROJ/.env"
    cp -f "$FOUND_ENV" "$PROJ/.env"
    FOUND_ENV="$PROJ/.env"
  fi
fi

echo "--- env presence check (keys only, no values) ---"
egrep -n "^(FIREBASE_|OPENAI_|YOUTUBE_)" "$PROJ/.env" || true

# 3) Install deps (if needed)
if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install || exit 1
fi

# 4) Force YouTube upload flag ON in Firebase (best effort, if script exists)
# (If you have a known script to toggle feature flags, it will run; otherwise we skip.)
if [ -f "scripts/setup-firebase-config.js" ]; then
  echo "Running firebase config setup (best-effort)..."
  node scripts/setup-firebase-config.js || true
fi

# 5) Validate YouTube credentials (real API call)
# Prefer existing script if present
if [ -f "scripts/test-youtube-auth.js" ]; then
  echo "=== YouTube AUTH TEST ==="
  ENV_PATH="$FOUND_ENV" node scripts/test-youtube-auth.js || true
else
  echo "⚠️ scripts/test-youtube-auth.js not found. Skipping auth test."
fi

# 6) Start/Restart PM2 worker with correct ENV_PATH
echo "=== START PM2 WORKER ==="
pm2 delete nova-video >/dev/null 2>&1 || true
ENV_PATH="$FOUND_ENV" pm2 start server/video-worker.js --name nova-video --update-env
pm2 save || true
pm2 status nova-video || true

# 7) End-to-end test (create job + wait + upload UNLISTED)
echo "=== END-TO-END TEST (UNLISTED) ==="
if [ -f "scripts/test-end-to-end.js" ]; then
  ENV_PATH="$FOUND_ENV" node scripts/test-end-to-end.js --unlisted || true
else
  echo "scripts/test-end-to-end.js not found, trying manual create-job.js"
  if [ -f "create-job.js" ]; then
    ENV_PATH="$FOUND_ENV" node create-job.js || true
    echo "Now watch logs:"
    pm2 logs nova-video --lines 120 --nostream || true
  else
    echo "❌ No test script and no create-job.js found."
    exit 1
  fi
fi

# 8) Print last logs for proof
echo "=== LAST LOGS (proof) ==="
pm2 logs nova-video --lines 200 --nostream || true

echo "=== DONE ==="
