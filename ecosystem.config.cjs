// PM2 Ecosystem configuration for NovaCiv services
// This ensures environment variables are properly loaded from .env file

const path = require("path");
const fs = require("fs");

// Resolve .env path (same logic as in ops-agent.js and video-worker.js)
const PROJECT_DIR = process.env.PROJECT_DIR || "/root/NovaCiv";
const ENV_FILE = process.env.ENV_FILE || path.join(PROJECT_DIR, ".env");

// Verify .env exists
if (!fs.existsSync(ENV_FILE)) {
  console.warn(`[ecosystem] WARNING: .env file not found at ${ENV_FILE}`);
}

// Parse .env file and load all variables (without printing secrets)
function loadEnvFile(envPath) {
  const envVars = {};
  
  if (!fs.existsSync(envPath)) {
    return envVars;
  }
  
  try {
    const envContent = fs.readFileSync(envPath, "utf8");
    const lines = envContent.split("\n");
    
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      
      // Parse KEY=VALUE format
      const match = trimmed.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        
        envVars[key] = value;
      }
    }
  } catch (error) {
    console.warn(`[ecosystem] WARNING: Failed to parse .env file: ${error.message}`);
  }
  
  return envVars;
}

// Load all environment variables from .env file
const envFileVars = loadEnvFile(ENV_FILE);

// Base environment variables
const baseEnv = {
  NODE_ENV: "production",
  ENV_PATH: ENV_FILE,
  PROJECT_DIR: PROJECT_DIR,
};

// Merge .env variables into base environment (baseEnv takes precedence for system vars)
const mergedEnv = { ...envFileVars, ...baseEnv };

module.exports = {
  apps: [
    {
      name: "nova-ops-agent",
      script: path.join(PROJECT_DIR, "server", "ops-agent.js"),
      cwd: PROJECT_DIR,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      env: mergedEnv,
      // PM2 now injects all .env variables directly into process.env
      error_file: path.join(process.env.HOME || "/root", ".pm2", "logs", "nova-ops-agent-error.log"),
      out_file: path.join(process.env.HOME || "/root", ".pm2", "logs", "nova-ops-agent-out.log"),
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
    },
    {
      name: "nova-video",
      script: path.join(PROJECT_DIR, "server", "video-worker.js"),
      cwd: PROJECT_DIR,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      env: mergedEnv,
      error_file: path.join(process.env.HOME || "/root", ".pm2", "logs", "nova-video-error.log"),
      out_file: path.join(process.env.HOME || "/root", ".pm2", "logs", "nova-video-out.log"),
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
    },
  ],
};
