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
      env: {
        NODE_ENV: "production",
        ENV_PATH: ENV_FILE,
        PROJECT_DIR: PROJECT_DIR,
      },
      // PM2 will not automatically load .env, so we set ENV_PATH
      // and the script will load it via dotenv
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
      env: {
        NODE_ENV: "production",
        ENV_PATH: ENV_FILE,
        PROJECT_DIR: PROJECT_DIR,
      },
      error_file: path.join(process.env.HOME || "/root", ".pm2", "logs", "nova-video-error.log"),
      out_file: path.join(process.env.HOME || "/root", ".pm2", "logs", "nova-video-out.log"),
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
    },
  ],
};
