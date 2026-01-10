// Real YouTube credentials validation
const path = require("path");
const envPath = process.env.ENV_PATH || 
  (process.platform === 'win32' ? path.join(__dirname, '.env') : '/root/NovaCiv/.env');

console.log("[VALIDATE] Loading env from:", envPath);
require("dotenv").config({ path: envPath });

const { google } = require("googleapis");

async function validate() {
  const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
  const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
  const REFRESH_TOKEN = process.env.YOUTUBE_REFRESH_TOKEN;

  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    throw new Error("Missing YouTube credentials in .env");
  }

  console.log("[VALIDATE] Client ID:", CLIENT_ID.substring(0, 20) + "...");
  console.log("[VALIDATE] Testing refresh token...");

  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

  // Real API call to get access token
  const { credentials } = await oauth2Client.refreshAccessToken();
  if (!credentials.access_token) {
    throw new Error("Failed to get access token");
  }

  console.log("[VALIDATE] Access token obtained");

  // Real API call to YouTube
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  const response = await youtube.channels.list({
    part: ["snippet"],
    mine: true,
  });

  if (!response.data.items || response.data.items.length === 0) {
    throw new Error("No channels found");
  }

  const channel = response.data.items[0];
  console.log("[VALIDATE] Channel:", channel.snippet.title);
  console.log("[VALIDATE] Channel ID:", channel.id);

  return {
    valid: true,
    channelId: channel.id,
    channelTitle: channel.snippet.title,
  };
}

validate().then(result => {
  console.log("[VALIDATE] SUCCESS - Credentials are VALID");
  process.exit(0);
}).catch(err => {
  console.error("[VALIDATE] FAILED:", err.message);
  if (err.response?.data) {
    console.error("[VALIDATE] API Error:", JSON.stringify(err.response.data, null, 2));
  }
  process.exit(1);
});
