const { google } = require("googleapis");
const readline = require("readline");

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;

// ВАЖНО: если в твоём Google OAuth Client уже прописан другой redirect,
// потом заменим на тот, что в server/youtube.js
const REDIRECT_URI =
  process.env.YOUTUBE_REDIRECT_URI || "http://localhost:3000/oauth2callback";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET in env");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const SCOPES = ["https://www.googleapis.com/auth/youtube.upload"];

const url = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: SCOPES,
  prompt: "consent" // заставляет Google выдать refresh_token
});

console.log("\nOpen this URL in your browser:\n");
console.log(url);
console.log(
  "\nAfter approval, you will be redirected. Copy either:\n" +
    "1) the 'code' value, OR\n" +
    "2) the full redirected URL (it contains ?code=...)\n"
);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question("Paste code here: ", async (codeOrUrl) => {
  try {
    const code = (codeOrUrl.includes("code="))
      ? new URL(codeOrUrl).searchParams.get("code")
      : codeOrUrl.trim();

    if (!code) throw new Error("No code found.");

    const { tokens } = await oauth2Client.getToken(code);
    console.log("\nTOKENS:\n", tokens);

    if (!tokens.refresh_token) {
      console.log(
        "\nNo refresh_token returned.\n" +
          "Usually means you already authorized before without prompt=consent, or wrong redirect.\n" +
          "Try revoking access in Google Account security and run again.\n"
      );
    } else {
      console.log("\nNEW REFRESH TOKEN:\n", tokens.refresh_token, "\n");
    }
  } catch (e) {
    console.error("\nERROR:", e?.message || e);
  } finally {
    rl.close();
  }
});
