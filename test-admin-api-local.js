// test-admin-api-local.js
// VPS local API self-test (DO NOT print token)
const fs = require("fs");
const http = require("http");

const envPath = "/root/NovaCiv/.env";
let adminToken = null;

// Read .env file
try {
  const envContent = fs.readFileSync(envPath, "utf8");
  const lines = envContent.split("\n");
  for (const line of lines) {
    const match = line.match(/^ADMIN_API_TOKEN\s*=\s*(.+)$/);
    if (match) {
      adminToken = match[1].trim().replace(/^["']|["']$/g, "");
      break;
    }
  }
} catch (e) {
  console.error("Failed to read .env:", e.message);
  process.exit(1);
}

if (!adminToken) {
  console.error("ADMIN_API_TOKEN not found in .env");
  process.exit(1);
}

// POST to local API
const postData = JSON.stringify({
  text: "test",
  history: [],
});

const options = {
  hostname: "127.0.0.1",
  port: 3001,
  path: "/admin/domovoy",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Admin-Token": adminToken,
    "Content-Length": Buffer.byteLength(postData),
  },
};

const req = http.request(options, (res) => {
  let body = "";
  res.on("data", (chunk) => {
    body += chunk.toString();
  });
  res.on("end", () => {
    const statusCode = res.statusCode;
    const preview = body.substring(0, 80);
    console.log(`Status: ${statusCode}`);
    console.log(`Response preview: ${preview}`);
    process.exit(statusCode === 200 ? 0 : 1);
  });
});

req.on("error", (e) => {
  console.error(`Request failed: ${e.message}`);
  process.exit(1);
});

req.write(postData);
req.end();
