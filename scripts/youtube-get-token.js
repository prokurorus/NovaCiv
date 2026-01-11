// scripts/youtube-get-token.js
// Simple script to generate OAuth URL and exchange code for refresh token

require('dotenv').config({ path: process.env.ENV_PATH || '/root/NovaCiv/.env' });
const { google } = require("googleapis");
const readline = require("readline");

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:3000/oauth2callback";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("❌ Error: YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET must be set in .env");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
];

// Generate and print OAuth URL
const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: SCOPES,
  prompt: "consent",
});

console.log("");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  YouTube OAuth Authorization URL");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("");
console.log("1. Open this URL in your browser:");
console.log("");
console.log(authUrl);
console.log("");
console.log("2. Authorize the app and copy the authorization code");
console.log("   (You'll see it in the URL after redirect, parameter 'code=...')");
console.log("");
console.log("3. Paste the code below:");
console.log("");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question("Authorization code: ", async (code) => {
  try {
    // Extract code from URL if user pasted full URL
    const codeMatch = code.match(/[?&]code=([^&]+)/);
    const authCode = codeMatch ? codeMatch[1] : code.trim();

    if (!authCode) {
      throw new Error("No authorization code provided");
    }

    console.log("");
    console.log("Exchanging code for tokens...");

    const { tokens } = await oauth2Client.getToken(authCode);
    
    if (tokens.refresh_token) {
      console.log("");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("✅ Success! Refresh token obtained:");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("");
      console.log(tokens.refresh_token);
      console.log("");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("");
      process.exit(0);
    } else {
      console.error("");
      console.error("❌ Warning: No refresh token in response");
      console.error("   This can happen if you've already authorized this app.");
      console.error("   Try revoking access at: https://myaccount.google.com/permissions");
      console.error("   Then run this script again.");
      process.exit(1);
    }
  } catch (error) {
    console.error("");
    console.error("❌ Error:", error.message);
    if (error.response) {
      console.error("Response:", error.response.data);
    }
    process.exit(1);
  } finally {
    rl.close();
  }
});
