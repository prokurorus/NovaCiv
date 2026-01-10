#!/usr/bin/env node
// scripts/test-end-to-end.js
//
// End-to-end test: Create job -> Wait for worker -> Verify YouTube upload
// This script creates a test job and monitors its progress
//
// Usage:
//   node scripts/test-end-to-end.js [--unlisted]

const args = process.argv.slice(2);
const useUnlisted = args.includes("--unlisted");

// Load env
const path = require("path");
const envPath = process.env.ENV_PATH || 
  (process.platform === 'win32' ? path.join(__dirname, '..', '.env') : '/root/NovaCiv/.env');
require("dotenv").config({ path: envPath });

const { getDatabase } = require("../server/config/firebase-config");

async function main() {
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  NovaCiv End-to-End Pipeline Test");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  
  // Check prerequisites
  console.log("1️⃣  Checking prerequisites...");
  
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON || !process.env.FIREBASE_DB_URL) {
    console.error("❌ Missing Firebase credentials");
    process.exit(1);
  }
  
  if (!process.env.OPENAI_API_KEY) {
    console.error("❌ Missing OPENAI_API_KEY");
    process.exit(1);
  }
  
  console.log("   ✅ Firebase credentials found");
  console.log("   ✅ OpenAI API key found");
  
  // Check YouTube credentials
  if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET || !process.env.YOUTUBE_REFRESH_TOKEN) {
    console.warn("   ⚠️  YouTube credentials missing - upload will be skipped if feature flag is enabled");
  } else {
    console.log("   ✅ YouTube credentials found");
  }
  
  console.log("");
  
  // Check feature flags
  console.log("2️⃣  Checking feature flags...");
  const db = getDatabase(console);
  const featuresRef = db.ref("config/features");
  const featuresSnapshot = await featuresRef.once("value");
  const features = featuresSnapshot.val() || {};
  
  console.log(`   youtubeUploadEnabled: ${features.youtubeUploadEnabled || false}`);
  console.log(`   telegramEnabled: ${features.telegramEnabled !== false}`);
  
  if (features.youtubeUploadEnabled !== true) {
    console.warn("   ⚠️  YouTube upload is disabled in Firebase");
    console.warn("   Set config/features/youtubeUploadEnabled = true to enable");
  }
  
  console.log("");
  
  // Create test job
  console.log("3️⃣  Creating test job...");
  
  const testJob = {
    createdAt: Date.now(),
    language: "en",
    title: useUnlisted ? "NovaCiv E2E Test (Unlisted)" : "NovaCiv E2E Test",
    topic: "End-to-end pipeline test",
    script: "NovaCiv is a digital civilization without rulers. Decisions are made openly by citizens. Visit novaciv.space.",
    status: "pending",
    testMode: true,
    testCreatedAt: Date.now(),
  };
  
  const jobRef = db.ref("videoJobs").push(testJob);
  const jobId = jobRef.key;
  
  console.log(`   ✅ Job created: ${jobId}`);
  console.log(`   Status: pending`);
  console.log("");
  
  console.log("4️⃣  Waiting for worker to process job...");
  console.log("   (Monitor with: pm2 logs nova-video)");
  console.log("");
  
  // Monitor job status
  const maxWaitTime = 5 * 60 * 1000; // 5 minutes
  const checkInterval = 10000; // 10 seconds
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    await new Promise(resolve => setTimeout(resolve, checkInterval));
    
    const jobSnapshot = await db.ref(`videoJobs/${jobId}`).once("value");
    const job = jobSnapshot.val();
    
    if (!job) {
      console.error("❌ Job was deleted!");
      process.exit(1);
    }
    
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    process.stdout.write(`\r   [${elapsed}s] Status: ${job.status || "unknown"}...`);
    
    if (job.status === "done") {
      console.log("");
      console.log("");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("  ✅ SUCCESS - Job completed!");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("");
      
      if (job.youtubeId) {
        console.log(`   YouTube Video ID: ${job.youtubeId}`);
        console.log(`   YouTube URL: https://youtube.com/watch?v=${job.youtubeId}`);
        console.log("");
      }
      
      if (job.videoPath) {
        console.log(`   Video Path: ${job.videoPath}`);
        console.log("");
      }
      
      console.log(`   Finished at: ${new Date(job.finishedAt).toISOString()}`);
      console.log(`   Duration: ${Math.floor((job.finishedAt - job.createdAt) / 1000)}s`);
      console.log("");
      
      process.exit(0);
    } else if (job.status === "error") {
      console.log("");
      console.log("");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("  ❌ ERROR - Job failed!");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("");
      console.log(`   Error: ${job.errorMessage || "Unknown error"}`);
      
      if (job.youtubeError) {
        console.log(`   YouTube Error: ${job.youtubeError}`);
      }
      
      console.log("");
      process.exit(1);
    } else if (job.status === "processing") {
      // Job is being processed, continue waiting
      continue;
    }
  }
  
  console.log("");
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  ⚠️  TIMEOUT - Job did not complete in time");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("   Check PM2 logs: pm2 logs nova-video");
  console.log("   Check job status in Firebase: videoJobs/" + jobId);
  console.log("");
  
  process.exit(1);
}

main().catch(error => {
  console.error("");
  console.error("❌ Test failed:", error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
