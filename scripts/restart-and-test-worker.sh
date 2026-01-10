#!/bin/bash
set -e

cd /root/NovaCiv || exit 1

echo "=== 1) SHOW ENV FILE METADATA ==="
ls -la /root/NovaCiv/.env
echo "--- .env keys present (NO VALUES) ---"
egrep -n "^(YOUTUBE_CLIENT_ID|YOUTUBE_CLIENT_SECRET|YOUTUBE_REFRESH_TOKEN|FIREBASE_DB_URL|OPENAI_API_KEY)=" /root/NovaCiv/.env || true

echo "=== 2) HARD RESTART PM2 WITH THIS .env ==="
pm2 delete nova-video >/dev/null 2>&1 || true

# Start with ENV_PATH explicitly pointing to the file we just inspected
ENV_PATH=/root/NovaCiv/.env pm2 start server/video-worker.js --name nova-video --update-env
pm2 save || true
pm2 status nova-video

echo "=== 3) CLEAR/ROTATE LOGS (so we don't see old errors) ==="
pm2 flush

echo "=== 4) REAL YOUTUBE REFRESH TEST (NO SECRETS PRINTED) ==="
node - <<'NODE'
require('dotenv').config({ path: process.env.ENV_PATH || '/root/NovaCiv/.env' });
const { google } = require('googleapis');

function need(n){ if(!process.env[n]) throw new Error("Missing env: " + n); }
need("YOUTUBE_CLIENT_ID");
need("YOUTUBE_CLIENT_SECRET");
need("YOUTUBE_REFRESH_TOKEN");

(async () => {
  const oauth2 = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
  try {
    const tok = await oauth2.getAccessToken(); // triggers refresh
    if (!tok || !tok.token) throw new Error("No access token returned");
    console.log("YOUTUBE_REFRESH_OK=1");
  } catch (e) {
    const msg = e?.response?.data?.error || e.message;
    console.log("YOUTUBE_REFRESH_OK=0");
    console.log("YOUTUBE_ERROR=" + msg);
  }
  process.exit(0);
})();
NODE

echo "=== 5) CREATE 1 PENDING JOB (youtube target) ==="
node - <<'NODE'
require('dotenv').config({ path: process.env.ENV_PATH || '/root/NovaCiv/.env' });
const admin = require("firebase-admin");
function need(name){ if(!process.env[name]) throw new Error("Missing env: "+name); }
need("FIREBASE_SERVICE_ACCOUNT_JSON");
need("FIREBASE_DB_URL");

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
admin.initializeApp({ credential: admin.credential.cert(sa), databaseURL: process.env.FIREBASE_DB_URL });
const db = admin.database();

(async () => {
  const ref = db.ref("videoJobs").push();
  const id = ref.key;
  await ref.set({
    createdAt: Date.now(),
    language: "en",
    script: "NovaCiv is a digital civilization without rulers. Decisions are made openly by citizens. Visit novaciv.space",
    status: "pending",
    targets: ["youtube"]
  });
  console.log("JOB_ID=" + id);
  process.exit(0);
})().catch(e=>{ console.error("CREATE_JOB_ERROR=" + e.message); process.exit(1); });
NODE

echo "=== 6) SHOW FRESH WORKER LOGS ==="
pm2 logs nova-video --lines 200 --nostream
