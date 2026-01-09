// scripts/youtube-auth-cli.js
//
// CLI tool to generate YouTube OAuth refresh token
// Run this on your PC (not on server) to get a new refresh token
//
// Usage:
//   1. Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in .env (or pass as env vars)
//   2. Run: node scripts/youtube-auth-cli.js
//   3. Follow the OAuth flow in your browser
//   4. Copy the refresh token to your server's .env file

const { google } = require("googleapis");
const readline = require("readline");
const http = require("http");
const url = require("url");

// Optional: try to load 'open' package for auto-opening browser
let open = null;
try {
  open = require("open");
} catch (e) {
  // open package not available, user will need to open browser manually
}

// Try to load .env (optional, can use env vars directly)
try {
  require("dotenv").config();
} catch (e) {
  // dotenv not available, use env vars
}

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:3000/oauth2callback";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("❌ Error: YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET must be set");
  console.error("");
  console.error("Set them in .env file or as environment variables:");
  console.error("  YOUTUBE_CLIENT_ID=your_client_id");
  console.error("  YOUTUBE_CLIENT_SECRET=your_client_secret");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// Scopes required for YouTube upload
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
];

function getAuthUrl() {
  return oauth2Client.generateAuthUrl({
    access_type: "offline", // Required to get refresh token
    scope: SCOPES,
    prompt: "consent", // Force consent screen to get refresh token
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const queryObject = url.parse(req.url, true).query;

        if (queryObject.code) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body>
                <h1>✅ Authorization successful!</h1>
                <p>You can close this window and return to the terminal.</p>
                <script>setTimeout(() => window.close(), 2000);</script>
              </body>
            </html>
          `);

          const { tokens } = await oauth2Client.getToken(queryObject.code);
          oauth2Client.setCredentials(tokens);

          server.close();

          if (tokens.refresh_token) {
            console.log("");
            console.log("✅ Success! Refresh token obtained:");
            console.log("");
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            console.log("Add this to your server's .env file:");
            console.log("");
            console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`);
            console.log("");
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            console.log("");
            console.log("⚠️  Important notes:");
            console.log("   - Refresh tokens can be revoked if user removes app access");
            console.log("   - Client ID/Secret must match the OAuth app used");
            console.log("   - Token must match the scopes requested");
            console.log("");
            resolve(tokens.refresh_token);
          } else {
            console.error("❌ Warning: No refresh token in response");
            console.error("   This can happen if you've already authorized this app.");
            console.error("   Try revoking access at: https://myaccount.google.com/permissions");
            console.error("   Then run this script again.");
            reject(new Error("No refresh token received"));
          }
        } else if (queryObject.error) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body>
                <h1>❌ Authorization failed</h1>
                <p>Error: ${queryObject.error}</p>
                <p>Check the terminal for details.</p>
              </body>
            </html>
          `);
          reject(new Error(`OAuth error: ${queryObject.error}`));
        }
      } catch (error) {
        reject(error);
      }
    });

    server.listen(3000, () => {
      console.log("🌐 OAuth callback server started on http://localhost:3000");
    });
  });
}

async function main() {
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  YouTube OAuth Refresh Token Generator");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("This will open your browser to authorize the app.");
  console.log("Make sure you're logged into the correct Google account.");
  console.log("");
  console.log("Client ID:", CLIENT_ID.substring(0, 20) + "...");
  console.log("");

  const authUrl = getAuthUrl();
  console.log("Opening browser...");
  console.log("(If browser doesn't open, visit this URL manually:)");
  console.log(authUrl);
  console.log("");

  try {
    // Try to open browser (optional dependency)
    try {
      await open(authUrl);
    } catch (e) {
      console.log("⚠️  Could not auto-open browser. Please visit the URL above.");
    }

    const refreshToken = await startServer();
    process.exit(0);
  } catch (error) {
    console.error("");
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

main();

