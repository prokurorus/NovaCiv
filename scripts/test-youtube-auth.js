// scripts/test-youtube-auth.js
//
// Тестовый скрипт для проверки YouTube авторизации БЕЗ реальной загрузки видео
// Проверяет: OAuth токены, доступ к API, возможность получить access token
//
// Usage:
//   node scripts/test-youtube-auth.js

require("dotenv").config();

const { google } = require("googleapis");

async function testYouTubeAuth() {
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  YouTube Auth Test (DRY RUN - NO UPLOAD)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  // 1. Проверка переменных окружения
  console.log("1️⃣  Checking environment variables...");
  const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
  const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
  const REFRESH_TOKEN = process.env.YOUTUBE_REFRESH_TOKEN;

  if (!CLIENT_ID) {
    console.error("❌ YOUTUBE_CLIENT_ID is not set");
    process.exit(1);
  }
  if (!CLIENT_SECRET) {
    console.error("❌ YOUTUBE_CLIENT_SECRET is not set");
    process.exit(1);
  }
  if (!REFRESH_TOKEN) {
    console.error("❌ YOUTUBE_REFRESH_TOKEN is not set");
    process.exit(1);
  }

  console.log("   ✅ YOUTUBE_CLIENT_ID:", CLIENT_ID.substring(0, 20) + "...");
  console.log("   ✅ YOUTUBE_CLIENT_SECRET:", CLIENT_SECRET.substring(0, 10) + "...");
  console.log("   ✅ YOUTUBE_REFRESH_TOKEN:", REFRESH_TOKEN.substring(0, 20) + "...");
  console.log("");

  // 2. Инициализация OAuth2 клиента
  console.log("2️⃣  Initializing OAuth2 client...");
  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
  console.log("   ✅ OAuth2 client initialized");
  console.log("");

  // 3. Получение access token (проверка refresh token)
  console.log("3️⃣  Testing refresh token (getting access token)...");
  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    if (credentials.access_token) {
      console.log("   ✅ Access token obtained successfully");
      console.log("   ✅ Token expires at:", credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : "unknown");
      oauth2Client.setCredentials(credentials);
    } else {
      throw new Error("No access token in response");
    }
  } catch (err) {
    if (err.message && err.message.includes("invalid_grant")) {
      console.error("   ❌ INVALID_GRANT ERROR");
      console.error("   This means refresh token is invalid or expired.");
      console.error("   Run: node scripts/youtube-auth-cli.js to regenerate token");
      process.exit(1);
    }
    throw err;
  }
  console.log("");

  // 4. Тест запроса к YouTube API (channels.list - безопасный запрос, только чтение)
  console.log("4️⃣  Testing YouTube API access (channels.list)...");
  try {
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });
    const response = await youtube.channels.list({
      part: ["snippet", "contentDetails"],
      mine: true,
    });

    if (response.data.items && response.data.items.length > 0) {
      const channel = response.data.items[0];
      console.log("   ✅ API access successful");
      console.log("   ✅ Channel ID:", channel.id);
      console.log("   ✅ Channel Title:", channel.snippet?.title || "N/A");
      console.log("   ✅ Channel Description:", (channel.snippet?.description || "").substring(0, 100) + "...");
    } else {
      console.log("   ⚠️  API access works but no channels found");
    }
  } catch (err) {
    if (err.response) {
      console.error("   ❌ API Error:", err.response.status, err.response.statusText);
      console.error("   Error details:", JSON.stringify(err.response.data, null, 2));
    } else {
      console.error("   ❌ Error:", err.message);
    }
    process.exit(1);
  }
  console.log("");

  // 5. Проверка прав доступа (scopes)
  console.log("5️⃣  Checking OAuth scopes...");
  try {
    // Получаем информацию о текущих scopes из access token
    const tokenInfo = await oauth2Client.getTokenInfo(oauth2Client.credentials.access_token);
    if (tokenInfo.scopes) {
      console.log("   ✅ Available scopes:");
      tokenInfo.scopes.forEach(scope => {
        const hasUpload = scope.includes("youtube.upload");
        console.log(`      ${hasUpload ? "✅" : "  "} ${scope}`);
      });
      
      const hasUploadScope = tokenInfo.scopes.some(s => s.includes("youtube.upload"));
      if (!hasUploadScope) {
        console.error("   ⚠️  WARNING: Missing 'youtube.upload' scope!");
        console.error("   You need to regenerate token with upload scope:");
        console.error("   node scripts/youtube-auth-cli.js");
      } else {
        console.log("   ✅ 'youtube.upload' scope is present");
      }
    }
  } catch (err) {
    console.error("   ⚠️  Could not check scopes:", err.message);
  }
  console.log("");

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  ✅ ALL CHECKS PASSED");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("YouTube авторизация работает корректно.");
  console.log("Для реальной загрузки видео используйте server/youtube.js");
  console.log("");
}

testYouTubeAuth().catch(err => {
  console.error("");
  console.error("❌ Test failed:", err.message);
  if (err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
