// PM2 Ecosystem Configuration
// Used for managing all PM2 processes on VPS

module.exports = {
  apps: [
    {
      name: "nova-ops-agent",
      script: "server/ops-agent.js",
      env: {
        NODE_ENV: "production",
      },
      // PM2 will load .env from /root/NovaCiv/.env automatically
    },
    {
      name: "nova-video",
      script: "server/video-worker.js",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "nova-admin-domovoy",
      script: "server/admin-domovoy-api.js",
      cwd: "/root/NovaCiv",
      env: {
        NODE_ENV: "production",
        PROJECT_DIR: "/root/NovaCiv",
      },
      // PM2 will load .env from /root/NovaCiv/.env automatically
      // Required env vars: ADMIN_API_TOKEN, OPENAI_API_KEY, ADMIN_DOMOVOY_PORT (optional, default 3001)
    },
  ],
};
