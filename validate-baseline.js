// Complete baseline validation
const path = require("path");
const fs = require("fs");

console.log("=" .repeat(60));
console.log("BASELINE VALIDATION");
console.log("=" .repeat(60));
console.log("");

// 1. Project directory
const projectPath = path.resolve(__dirname);
console.log("[1] Project Path:", projectPath);

// 2. .env location
const envPath = process.env.ENV_PATH || 
  (process.platform === 'win32' ? path.join(projectPath, '.env') : '/root/NovaCiv/.env');
console.log("[2] Expected .env Path:", envPath);
console.log("[2] .env Exists:", fs.existsSync(envPath) ? "YES" : "NO");

// 3. Check if .env exists and list vars (without values)
if (fs.existsSync(envPath)) {
  try {
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
    const vars = lines.map(l => l.split('=')[0].trim()).filter(Boolean);
    console.log("[2] .env Variables Found:", vars.length);
    console.log("[2] Variable Names:", vars.join(', '));
  } catch (err) {
    console.log("[2] Error reading .env:", err.message);
  }
} else {
  console.log("[2] .env file not found - credentials cannot be validated");
}

// 4. Check required files
const requiredFiles = [
  'server/video-worker.js',
  'server/youtube.js',
  'server/config/firebase-config.js',
  'media/scripts/pipeline.js',
  'package.json',
];

console.log("");
console.log("[3] Required Files:");
for (const file of requiredFiles) {
  const filePath = path.join(projectPath, file);
  console.log(`     ${fs.existsSync(filePath) ? '✓' : '✗'} ${file}`);
}

// 5. Check node_modules
console.log("");
console.log("[4] Dependencies:");
const nodeModulesPath = path.join(projectPath, 'node_modules');
console.log(`     node_modules exists: ${fs.existsSync(nodeModulesPath) ? 'YES' : 'NO'}`);
const checkDeps = ['googleapis', 'firebase-admin', 'dotenv', 'ffmpeg-static'];
for (const dep of checkDeps) {
  const depPath = path.join(nodeModulesPath, dep);
  console.log(`     ${fs.existsSync(depPath) ? '✓' : '✗'} ${dep}`);
}

// 6. PM2 check
console.log("");
console.log("[5] PM2 Status:");
console.log("     Run: pm2 list");

console.log("");
console.log("=" .repeat(60));
