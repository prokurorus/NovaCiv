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
    // Try to show useful details
    const apiData = err?.response?.data;
    if (apiData) {
      console.error("[youtube] API error data:", JSON.stringify(apiData, null, 2));
    }
    console.error("[youtube] upload failed:", err?.message || err);
    throw err;
  }
}

module.exports = uploadToYouTube;
