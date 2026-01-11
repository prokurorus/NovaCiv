// server/youtube.js
//
// uploadToYouTube(videoPath, title, options?)
//
// Env required:
// - YOUTUBE_CLIENT_ID
// - YOUTUBE_CLIENT_SECRET
// - YOUTUBE_REFRESH_TOKEN
//
// Optional env:
// - YOUTUBE_PRIVACY_STATUS   ("public" | "unlisted" | "private") default: "public"
// - YOUTUBE_CHANNEL_LANGUAGE (e.g. "en", "ru", "de", "es") default: "en"
// - YOUTUBE_DEFAULT_TAGS     (comma separated)
// - YOUTUBE_DESCRIPTION      (default description template)

const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function buildDescription({ title, lang }) {
  const base =
    process.env.YOUTUBE_DESCRIPTION ||
    "NovaCiv — digital civilization without rulers. Decisions are made openly by citizens.\n\nWebsite: https://novaciv.space\n";

  const langLine =
    lang && typeof lang === "string" ? `\nLanguage: ${lang}\n` : "";

  // YouTube links are clickable in description
  return `${title ? title + "\n\n" : ""}${base}${langLine}`;
}

function normalizeTags(extraTags) {
  const fromEnv = (process.env.YOUTUBE_DEFAULT_TAGS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const merged = [...fromEnv, ...(extraTags || [])]
    .map((s) => String(s).trim())
    .filter(Boolean);

  // de-dup
  return Array.from(new Set(merged)).slice(0, 40);
}

async function uploadToYouTube(videoPath, title, options = {}) {
  if (!videoPath) throw new Error("videoPath is required");
  if (!fs.existsSync(videoPath)) throw new Error(`Video not found: ${videoPath}`);

  const clientId = requiredEnv("YOUTUBE_CLIENT_ID");
  const clientSecret = requiredEnv("YOUTUBE_CLIENT_SECRET");
  const refreshToken = requiredEnv("YOUTUBE_REFRESH_TOKEN");

  const privacyStatus =
    options.privacyStatus ||
    process.env.YOUTUBE_PRIVACY_STATUS ||
    "public";

  const lang =
    options.lang ||
    process.env.YOUTUBE_CHANNEL_LANGUAGE ||
    "en";

  const description =
    options.description || buildDescription({ title, lang });

  const tags = normalizeTags(options.tags);

  // OAuth2: we only need refresh_token; googleapis will fetch access token automatically
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  const fileSize = fs.statSync(videoPath).size;
  const fileName = path.basename(videoPath);

  console.log("[youtube] uploading file:", fileName, "bytes:", fileSize);
  console.log("[youtube] privacyStatus:", privacyStatus);

  try {
    const res = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: title || "NovaCiv",
          description,
          tags,
          // categoryId 22 = People & Blogs (neutral default)
          categoryId: "22",
          defaultLanguage: lang,
          defaultAudioLanguage: lang,
        },
        status: {
          privacyStatus,
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: fs.createReadStream(videoPath),
      },
    }, {
      // helps large uploads
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      onUploadProgress: (evt) => {
        if (!evt || !evt.bytesRead) return;
        const pct = Math.round((evt.bytesRead / fileSize) * 100);
        if (pct % 10 === 0) console.log("[youtube] progress:", pct + "%");
      },
    });

    const videoId = res?.data?.id;
    if (!videoId) {
      console.log("[youtube] unexpected response:", res && res.data);
      throw new Error("YouTube upload finished but no videoId returned");
    }

    console.log("[youtube] uploaded OK, videoId:", videoId);
    return videoId;
  } catch (err) {
    // Detect and log invalid_grant errors with actionable hints
    const apiData = err?.response?.data;
    const errorMessage = err?.message || String(err);
    const errorCode = apiData?.error?.errors?.[0]?.reason || apiData?.error?.code;
    
    if (errorMessage.includes("invalid_grant") || errorCode === "invalid_grant") {
      console.error("[youtube] ❌ INVALID_GRANT ERROR DETECTED");
      console.error("[youtube] This usually means:");
      console.error("[youtube]   1. Refresh token was revoked (user removed app access)");
      console.error("[youtube]   2. Client ID/Secret mismatch (wrong OAuth app)");
      console.error("[youtube]   3. Clock skew (server time is incorrect)");
      console.error("[youtube]   4. Token expired and cannot be refreshed");
      console.error("[youtube]");
      console.error("[youtube] ACTION REQUIRED: Regenerate refresh token");
      console.error("[youtube] Run: node scripts/youtube-auth-cli.js");
      console.error("[youtube] Then update YOUTUBE_REFRESH_TOKEN in .env");
      console.error("[youtube]");
      if (apiData) {
        console.error("[youtube] API error details:", JSON.stringify(apiData, null, 2));
      }
    } else {
      // Try to show useful details for other errors
      if (apiData) {
        console.error("[youtube] API error data:", JSON.stringify(apiData, null, 2));
      }
    }
    console.error("[youtube] upload failed:", errorMessage);
    throw err;
  }
}


/**
 * Health check: проверяет валидность YouTube access token без upload
 * @returns {Promise<{ok: boolean, error?: string, message?: string}>}
 */
async function checkYouTubeAuth() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return { ok: false, error: "YouTube credentials not configured" };
  }

  try {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    // Пытаемся получить access token через refresh
    const { credentials } = await oauth2Client.refreshAccessToken();

    if (credentials && credentials.access_token) {
      return { ok: true };
    }

    return { ok: false, error: "No access token received" };
  } catch (err) {
    const errorMessage = err?.message || String(err);
    const apiData = err?.response?.data;
    const errorCode = apiData?.error?.errors?.[0]?.reason || apiData?.error?.code;

    // Определяем тип ошибки
    if (errorMessage.includes("invalid_grant") || errorCode === "invalid_grant") {
      return {
        ok: false,
        error: "invalid_grant",
        message: "Refresh token is invalid or expired. Regenerate token using: node scripts/youtube-get-token.js",
      };
    }

    return {
      ok: false,
      error: errorCode || "unknown",
      message: errorMessage,
    };
  }
}

// Attach checkYouTubeAuth to uploadToYouTube before export
uploadToYouTube.checkYouTubeAuth = checkYouTubeAuth;
module.exports = uploadToYouTube;
