#!/bin/bash
set -e

# Change to project directory (server path)
cd /root/NovaCiv || exit 1

# 1) Create ONE pending job directly in Firebase (no extra files, just inline node)
node - <<'NODE'
require('dotenv').config({ path: process.env.ENV_PATH || '/root/NovaCiv/.env' });
const admin = require("firebase-admin");

function need(name){ if(!process.env[name]) throw new Error("Missing env: "+name); }
need("FIREBASE_SERVICE_ACCOUNT_JSON");
need("FIREBASE_DB_URL");
need("OPENAI_API_KEY"); // required for TTS stage
// YouTube vars are optional if feature flag disables upload, but we want full run:
need("YOUTUBE_CLIENT_ID");
need("YOUTUBE_CLIENT_SECRET");
need("YOUTUBE_REFRESH_TOKEN");

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
admin.initializeApp({ credential: admin.credential.cert(sa), databaseURL: process.env.FIREBASE_DB_URL });
const db = admin.database();

(async () => {
  const ref = db.ref("videoJobs").push();
  const id = ref.key;
  const job = {
    createdAt: Date.now(),
    language: "en",
    script: "NovaCiv is a digital civilization without rulers. Decisions are made openly by citizens. Visit novaciv.space",
    status: "pending",
    targets: ["youtube"]
  };
  await ref.set(job);
  console.log("✅ Created job:", id);
  process.exit(0);
})().catch(e=>{ console.error("❌ Create job failed:", e.message); process.exit(1); });
NODE

# 2) Watch worker logs until it finishes or errors (max ~6 minutes)
pm2 logs nova-video --lines 200 --nostream
