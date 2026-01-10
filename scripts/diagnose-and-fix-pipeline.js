#!/usr/bin/env node
// scripts/diagnose-and-fix-pipeline.js
//
// Comprehensive diagnostic and fix script for NovaCiv video pipeline
// Tests: PM2, environment, YouTube OAuth, Firebase, and end-to-end pipeline
//
// Usage:
//   node scripts/diagnose-and-fix-pipeline.js [--fix] [--test-upload]

const { spawn, exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");

const execAsync = promisify(exec);

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

const args = process.argv.slice(2);
const shouldFix = args.includes("--fix");
const shouldTestUpload = args.includes("--test-upload");

const report = {
  timestamp: new Date().toISOString(),
  platform: process.platform,
  nodeVersion: process.version,
  findings: [],
  fixes: [],
  errors: [],
  success: false,
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log("");
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "cyan");
  log(`  ${title}`, "bright");
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "cyan");
  console.log("");
}

function addFinding(type, message, severity = "info") {
  report.findings.push({ type, message, severity, timestamp: Date.now() });
  const icon = severity === "error" ? "❌" : severity === "warning" ? "⚠️" : "ℹ️";
  log(`${icon} ${type}: ${message}`, severity === "error" ? "red" : severity === "warning" ? "yellow" : "blue");
}

function addFix(message) {
  report.fixes.push({ message, timestamp: Date.now() });
  log(`🔧 Fix: ${message}`, "green");
}

function addError(message, error) {
  report.errors.push({ message, error: error?.message || String(error), timestamp: Date.now() });
  log(`❌ Error: ${message}`, "red");
  if (error?.stack) {
    console.error(error.stack);
  }
}

async function checkPm2Processes() {
  logSection("1. Checking PM2 Processes");
  
  try {
    const { stdout } = await execAsync("pm2 list");
    const lines = stdout.split("\n");
    const hasVideoWorker = lines.some(line => line.includes("nova-video") || line.includes("video-worker"));
    
    if (hasVideoWorker) {
      addFinding("PM2", "Found PM2 process matching video-worker", "info");
      
      // Get detailed info
      try {
        const { stdout: info } = await execAsync("pm2 jlist");
        const processes = JSON.parse(info);
        const videoProcess = processes.find(p => 
          p.name?.includes("video") || p.name?.includes("nova")
        );
        
        if (videoProcess) {
          log(`   Process Name: ${videoProcess.name}`, "cyan");
          log(`   Status: ${videoProcess.pm2_env?.status || "unknown"}`, "cyan");
          log(`   PID: ${videoProcess.pid || "N/A"}`, "cyan");
          log(`   Uptime: ${videoProcess.pm2_env?.pm_uptime ? formatUptime(Date.now() - videoProcess.pm2_env.pm_uptime) : "N/A"}`, "cyan");
          
          if (videoProcess.pm2_env?.status !== "online") {
            addFinding("PM2", `Process is not online: ${videoProcess.pm2_env?.status}`, "warning");
          }
          
          // Check environment variables
          if (videoProcess.pm2_env?.env) {
            const env = videoProcess.pm2_env.env;
            const requiredVars = [
              "YOUTUBE_CLIENT_ID",
              "YOUTUBE_CLIENT_SECRET", 
              "YOUTUBE_REFRESH_TOKEN",
              "FIREBASE_SERVICE_ACCOUNT_JSON",
              "FIREBASE_DB_URL",
              "OPENAI_API_KEY"
            ];
            
            const missing = requiredVars.filter(v => !env[v]);
            if (missing.length > 0) {
              addFinding("PM2", `Missing env vars in PM2: ${missing.join(", ")}`, "error");
            } else {
              addFinding("PM2", "All required env vars present in PM2", "info");
            }
          }
        }
      } catch (e) {
        addFinding("PM2", "Could not get detailed PM2 info", "warning");
      }
    } else {
      addFinding("PM2", "No PM2 process found for video-worker", "error");
      if (shouldFix) {
        addFix("Would start PM2 process (manual action required)");
      }
    }
  } catch (error) {
    if (error.message.includes("command not found") || error.message.includes("pm2: not found")) {
      addFinding("PM2", "PM2 is not installed or not in PATH", "error");
    } else {
      addError("PM2 check failed", error);
    }
  }
}

function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

async function checkProjectLocation() {
  logSection("2. Checking Project Location");
  
  const possiblePaths = [
    "/root/NovaCiv",
    path.join(process.env.HOME || "", "NovaCiv"),
    process.cwd(),
  ];
  
  let projectPath = null;
  for (const testPath of possiblePaths) {
    if (fs.existsSync(testPath) && fs.existsSync(path.join(testPath, "server", "video-worker.js"))) {
      projectPath = testPath;
      addFinding("Project", `Found project at: ${projectPath}`, "info");
      break;
    }
  }
  
  if (!projectPath) {
    projectPath = process.cwd();
    addFinding("Project", `Using current directory: ${projectPath}`, "warning");
  }
  
  report.projectPath = projectPath;
  return projectPath;
}

async function checkEnvFile(projectPath) {
  logSection("3. Checking Environment File");
  
  const envPaths = [
    path.join(projectPath, ".env"),
    process.env.ENV_PATH,
    "/root/NovaCiv/.env",
  ].filter(Boolean);
  
  let envPath = null;
  for (const testPath of envPaths) {
    if (fs.existsSync(testPath)) {
      envPath = testPath;
      addFinding("Env", `Found .env at: ${envPath}`, "info");
      break;
    }
  }
  
  if (!envPath) {
    addFinding("Env", "No .env file found", "error");
    if (shouldFix) {
      addFix("Would create .env file (manual action required - copy from template)");
    }
    return null;
  }
  
  // Load and check env vars
  require("dotenv").config({ path: envPath });
  
  const requiredVars = {
    "FIREBASE_SERVICE_ACCOUNT_JSON": "Firebase service account (required for feature flags)",
    "FIREBASE_DB_URL": "Firebase database URL",
    "YOUTUBE_CLIENT_ID": "YouTube OAuth client ID",
    "YOUTUBE_CLIENT_SECRET": "YouTube OAuth client secret",
    "YOUTUBE_REFRESH_TOKEN": "YouTube OAuth refresh token",
    "OPENAI_API_KEY": "OpenAI API key (for TTS)",
  };
  
  const optionalVars = {
    "YOUTUBE_PRIVACY_STATUS": "YouTube privacy (public/unlisted/private)",
    "YOUTUBE_CHANNEL_LANGUAGE": "YouTube channel language",
    "TELEGRAM_BOT_TOKEN": "Telegram bot token",
  };
  
  const missing = [];
  for (const [varName, description] of Object.entries(requiredVars)) {
    if (!process.env[varName]) {
      missing.push(varName);
      addFinding("Env", `Missing required: ${varName} (${description})`, "error");
    } else {
      addFinding("Env", `Found: ${varName}`, "info");
    }
  }
  
  for (const [varName, description] of Object.entries(optionalVars)) {
    if (process.env[varName]) {
      addFinding("Env", `Found optional: ${varName}`, "info");
    }
  }
  
  if (missing.length > 0) {
    addFinding("Env", `${missing.length} required variables missing`, "error");
  }
  
  report.envPath = envPath;
  return envPath;
}

async function testYouTubeAuth() {
  logSection("4. Testing YouTube OAuth");
  
  if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET || !process.env.YOUTUBE_REFRESH_TOKEN) {
    addFinding("YouTube", "Missing YouTube credentials, skipping auth test", "warning");
    return false;
  }
  
  try {
    const { google } = require("googleapis");
    
    log("   Initializing OAuth2 client...", "cyan");
    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
    
    log("   Testing refresh token...", "cyan");
    const { credentials } = await oauth2Client.refreshAccessToken();
    
    if (!credentials.access_token) {
      addFinding("YouTube", "Refresh token failed: no access token received", "error");
      return false;
    }
    
    addFinding("YouTube", "Refresh token is valid, access token obtained", "info");
    oauth2Client.setCredentials(credentials);
    
    log("   Testing API access (channels.list)...", "cyan");
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });
    const response = await youtube.channels.list({
      part: ["snippet", "contentDetails"],
      mine: true,
    });
    
    if (response.data.items && response.data.items.length > 0) {
      const channel = response.data.items[0];
      log(`   Channel ID: ${channel.id}`, "cyan");
      log(`   Channel Title: ${channel.snippet?.title || "N/A"}`, "cyan");
      addFinding("YouTube", "API access successful, channel found", "info");
      
      // Check scopes
      try {
        const tokenInfo = await oauth2Client.getTokenInfo(credentials.access_token);
        if (tokenInfo.scopes) {
          const hasUploadScope = tokenInfo.scopes.some(s => s.includes("youtube.upload"));
          if (hasUploadScope) {
            addFinding("YouTube", "youtube.upload scope is present", "info");
          } else {
            addFinding("YouTube", "Missing youtube.upload scope", "error");
            addFix("Regenerate refresh token with upload scope: node scripts/youtube-auth-cli.js");
          }
        }
      } catch (e) {
        addFinding("YouTube", "Could not verify scopes", "warning");
      }
      
      return true;
    } else {
      addFinding("YouTube", "API access works but no channels found", "warning");
      return false;
    }
  } catch (error) {
    if (error.message && error.message.includes("invalid_grant")) {
      addFinding("YouTube", "INVALID_GRANT: Refresh token is invalid/expired", "error");
      addFix("Regenerate refresh token: node scripts/youtube-auth-cli.js");
      addFix("Then update YOUTUBE_REFRESH_TOKEN in .env and restart PM2 with: pm2 restart nova-video --update-env");
    } else {
      addError("YouTube auth test failed", error);
    }
    return false;
  }
}

async function testFirebaseConnection() {
  logSection("5. Testing Firebase Connection");
  
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON || !process.env.FIREBASE_DB_URL) {
    addFinding("Firebase", "Missing Firebase credentials, skipping test", "warning");
    return false;
  }
  
  try {
    // Ensure we're in the project directory for requires
    const originalCwd = process.cwd();
    const projectPath = report.projectPath || process.cwd();
    if (projectPath !== originalCwd) {
      process.chdir(projectPath);
    }
    
    const { getDatabase } = require("./server/config/firebase-config");
    const db = getDatabase(console);
    
    log("   Testing database connection...", "cyan");
    const featuresRef = db.ref("config/features");
    const snapshot = await featuresRef.once("value");
    const features = snapshot.val() || {};
    
    log(`   youtubeUploadEnabled: ${features.youtubeUploadEnabled || false}`, "cyan");
    log(`   telegramEnabled: ${features.telegramEnabled !== false}`, "cyan");
    
    if (features.youtubeUploadEnabled === true) {
      addFinding("Firebase", "youtubeUploadEnabled is TRUE - YouTube upload is enabled", "info");
    } else {
      addFinding("Firebase", "youtubeUploadEnabled is FALSE - YouTube upload is disabled", "warning");
      addFix("Enable YouTube upload in Firebase: config/features/youtubeUploadEnabled = true");
    }
    
    // Check for pending jobs
    const jobsRef = db.ref("videoJobs");
    const jobsSnapshot = await jobsRef.orderByChild("status").equalTo("pending").limitToFirst(1).once("value");
    const pendingJobs = jobsSnapshot.val() || {};
    const pendingCount = Object.keys(pendingJobs).length;
    
    log(`   Pending jobs: ${pendingCount}`, "cyan");
    if (pendingCount > 0) {
      addFinding("Firebase", `${pendingCount} pending job(s) found`, "info");
    } else {
      addFinding("Firebase", "No pending jobs found", "info");
    }
    
    addFinding("Firebase", "Firebase connection successful", "info");
    return true;
  } catch (error) {
    addError("Firebase connection test failed", error);
    return false;
  }
}

async function checkDependencies(projectPath) {
  logSection("6. Checking Dependencies");
  
  const packageJsonPath = path.join(projectPath, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    addFinding("Dependencies", "package.json not found", "error");
    return false;
  }
  
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const requiredDeps = ["googleapis", "openai", "firebase-admin", "ffmpeg-static", "dotenv"];
  
  for (const dep of requiredDeps) {
    if (packageJson.dependencies?.[dep] || packageJson.devDependencies?.[dep]) {
      addFinding("Dependencies", `Found in package.json: ${dep}`, "info");
    } else {
      addFinding("Dependencies", `Missing from package.json: ${dep}`, "error");
    }
  }
  
  // Check if node_modules exists
  const nodeModulesPath = path.join(projectPath, "node_modules");
  if (!fs.existsSync(nodeModulesPath)) {
    addFinding("Dependencies", "node_modules not found, run: npm install", "error");
    return false;
  }
  
  // Check specific modules
  for (const dep of requiredDeps) {
    const depPath = path.join(nodeModulesPath, dep);
    if (fs.existsSync(depPath)) {
      addFinding("Dependencies", `Installed: ${dep}`, "info");
    } else {
      addFinding("Dependencies", `Not installed: ${dep}, run: npm install`, "error");
    }
  }
  
  return true;
}

async function testPipeline(projectPath, testUpload = false) {
  logSection("7. Testing Video Pipeline");
  
  if (!shouldTestUpload && !testUpload) {
    addFinding("Pipeline", "Skipping full pipeline test (use --test-upload to enable)", "info");
    return false;
  }
  
  if (!process.env.OPENAI_API_KEY) {
    addFinding("Pipeline", "Missing OPENAI_API_KEY, cannot test pipeline", "error");
    return false;
  }
  
  try {
    log("   Creating test job in Firebase...", "cyan");
    // Ensure we're in the project directory for requires
    const originalCwd = process.cwd();
    const projectPath = report.projectPath || process.cwd();
    if (projectPath !== originalCwd) {
      process.chdir(projectPath);
    }
    
    const { getDatabase } = require("./server/config/firebase-config");
    const db = getDatabase(console);
    
    const testJob = {
      createdAt: Date.now(),
      language: "en",
      title: testUpload ? "NovaCiv Pipeline Test (Unlisted)" : "NovaCiv Pipeline Test",
      topic: "Pipeline diagnostic test",
      script: "NovaCiv is a digital civilization without rulers. This is a test video.",
      status: "pending",
      testMode: true,
    };
    
    const jobRef = db.ref("videoJobs").push(testJob);
    const jobId = jobRef.key;
    
    log(`   Test job created: ${jobId}`, "cyan");
    addFinding("Pipeline", `Test job created: ${jobId}`, "info");
    
    if (testUpload) {
      // Set privacy to unlisted for test
      const originalPrivacy = process.env.YOUTUBE_PRIVACY_STATUS;
      process.env.YOUTUBE_PRIVACY_STATUS = "unlisted";
      
      log("   Note: Video will be uploaded as UNLISTED", "yellow");
      log("   Waiting 60 seconds for worker to process...", "cyan");
      log("   Monitor progress with: pm2 logs nova-video", "cyan");
      
      // Wait a bit and check status
      await new Promise(resolve => setTimeout(resolve, 60000));
      
      const jobSnapshot = await db.ref(`videoJobs/${jobId}`).once("value");
      const job = jobSnapshot.val();
      
      if (job.status === "done" && job.youtubeId) {
        addFinding("Pipeline", `SUCCESS: Video uploaded to YouTube: https://youtube.com/watch?v=${job.youtubeId}`, "info");
        log(`   YouTube URL: https://youtube.com/watch?v=${job.youtubeId}`, "green");
        
        if (originalPrivacy) {
          process.env.YOUTUBE_PRIVACY_STATUS = originalPrivacy;
        }
        return true;
      } else if (job.status === "error") {
        addFinding("Pipeline", `Job failed: ${job.errorMessage || "Unknown error"}`, "error");
        return false;
      } else {
        addFinding("Pipeline", "Job still processing or timed out, check PM2 logs", "warning");
        return false;
      }
    } else {
      log("   Job created successfully, worker will process it", "cyan");
      return true;
    }
  } catch (error) {
    addError("Pipeline test failed", error);
    return false;
  }
}

function generateReport() {
  logSection("8. Final Report");
  
  const errorCount = report.findings.filter(f => f.severity === "error").length;
  const warningCount = report.findings.filter(f => f.severity === "warning").length;
  
  log(`Total Findings: ${report.findings.length}`, "cyan");
  log(`  Errors: ${errorCount}`, errorCount > 0 ? "red" : "green");
  log(`  Warnings: ${warningCount}`, warningCount > 0 ? "yellow" : "green");
  log(`  Info: ${report.findings.filter(f => f.severity === "info").length}`, "blue");
  
  if (errorCount === 0 && warningCount === 0) {
    log("", "green");
    log("✅ Pipeline is ready!", "green");
    report.success = true;
  } else {
    log("", "yellow");
    log("⚠️  Issues found - review findings above", "yellow");
  }
  
  // Save report to file
  const reportPath = path.join(report.projectPath || process.cwd(), "pipeline-diagnostic-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log(`\nFull report saved to: ${reportPath}`, "cyan");
  
  return report;
}

async function main() {
  log("", "bright");
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "bright");
  log("  NovaCiv Video Pipeline Diagnostic Tool", "bright");
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "bright");
  log("", "bright");
  
  if (shouldFix) {
    log("Mode: DIAGNOSTIC + AUTO-FIX", "yellow");
  } else {
    log("Mode: DIAGNOSTIC ONLY (use --fix to enable auto-fix)", "cyan");
  }
  
  if (shouldTestUpload) {
    log("Test Upload: ENABLED (will create and process test job)", "yellow");
  }
  
  try {
    await checkPm2Processes();
    const projectPath = await checkProjectLocation();
    await checkEnvFile(projectPath);
    await checkDependencies(projectPath);
    await testFirebaseConnection();
    await testYouTubeAuth();
    
    if (shouldTestUpload) {
      await testPipeline(projectPath, true);
    }
    
    const finalReport = generateReport();
    
    // Output summary recommendations
    logSection("Next Steps");
    
    const errors = report.findings.filter(f => f.severity === "error");
    if (errors.length > 0) {
      log("Critical issues to fix:", "red");
      errors.forEach(e => {
        log(`  • ${e.message}`, "red");
      });
      console.log("");
    }
    
    log("Commands to run:", "cyan");
    log("  1. Start/restart PM2 worker:", "cyan");
    log("     pm2 start server/video-worker.js --name nova-video --update-env", "cyan");
    log("     pm2 save", "cyan");
    console.log("");
    log("  2. Monitor logs:", "cyan");
    log("     pm2 logs nova-video", "cyan");
    console.log("");
    log("  3. Create test job:", "cyan");
    log("     node create-job.js", "cyan");
    console.log("");
    
    process.exit(finalReport.success ? 0 : 1);
  } catch (error) {
    addError("Diagnostic script failed", error);
    generateReport();
    process.exit(1);
  }
}

main();
