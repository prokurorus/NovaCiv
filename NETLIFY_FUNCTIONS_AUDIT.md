# Netlify Functions Audit Report

**Date:** 2024  
**Location:** `/netlify/functions/`  
**Total Functions:** 16

---

## Summary Table

| Function | Purpose (1 line) | Category | Env Vars Required | Called By | Status |
|----------|------------------|----------|-------------------|-----------|--------|
| **ai-domovoy.js** | Main Domovoy AI assistant - answers user questions with Manifest/Charter context, generates TTS audio | a) Domovoy | `OPENAI_API_KEY`, `FIREBASE_DB_URL`, `OPENAI_TTS_MODEL` (opt), `OPENAI_TTS_VOICE` (opt) | Frontend: `AssistantWidget.tsx` | ✅ Active |
| **ai-voice.js** | Standalone TTS (text-to-speech) generation via OpenAI API | a) Domovoy | `OPENAI_API_KEY`, `OPENAI_TTS_MODEL` (opt) | Unknown (standalone utility) | ⚠️ Unused? |
| **auto-create-video-job.js** | Test stub - returns minimal test response | c) Video Jobs | None | None | ❌ Legacy/Stub |
| **create-video-job.js** | Creates video job in Firebase `videoJobs/` with cyclic language rotation (ru→en→de→es) | c) Video Jobs | `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_DB_URL` or `FIREBASE_DATABASE_URL` | Manual/cron (not scheduled) | ✅ Active |
| **domovoy-auto-post.js** | Auto-generates philosophical posts via OpenAI, saves to `forum/topics` with `section: "news"` | a) Domovoy | `OPENAI_API_KEY`, `FIREBASE_DB_URL`, `DOMOVOY_CRON_SECRET`, `OPENAI_MODEL` (opt) | Manual/cron (not scheduled) | ✅ Active |
| **domovoy-auto-reply.js** | Auto-replies to forum comments in "news" section topics created by Domovoy (max 5 replies per run) | a) Domovoy | `OPENAI_API_KEY`, `FIREBASE_DB_URL`, `DOMOVOY_CRON_SECRET`, `OPENAI_MODEL` (opt) | Manual/cron (not scheduled) | ✅ Active |
| **domovoy-reply.js** | Replies to comments in "news" section forum topics (max 3 replies per run, marks `domovoyReplied: true`) | a) Domovoy | `OPENAI_API_KEY`, `FIREBASE_DB_URL`, `DOMOVOY_REPLY_CRON_SECRET`, `OPENAI_MODEL` (opt) | Manual/cron (not scheduled) | ⚠️ Duplicate? |
| **fetch-news.js** | Fetches RSS news from multiple sources (BBC, DW, Meduza, Guardian, Tagesschau), analyzes via OpenAI, translates, saves to `forum/topics` | b) News | `OPENAI_API_KEY`, `FIREBASE_DB_URL`, `NEWS_CRON_SECRET`, `OPENAI_MODEL` (opt) | Scheduled: `news-cron.js` (hourly) | ✅ Active |
| **generate-video-background.js** | Background video generation - calls `media/scripts/pipeline.js` | c) Video Jobs | None (uses pipeline) | `generate-video.js` | ✅ Active |
| **generate-video.js** | HTTP trigger that calls `generate-video-background.js` asynchronously | c) Video Jobs | `URL` or `DEPLOY_PRIME_URL` or `SITE_NAME` (Netlify auto) | Manual/API | ✅ Active |
| **hello.js** | Test function - returns "hello function is working" | Utility | None | None | ❌ Test/Legacy |
| **news-cron.js** | Scheduled cron wrapper - posts news topics from `forum/topics` (section: "news") to Telegram channels | b) News | `FIREBASE_DB_URL`, `NEWS_CRON_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_NEWS_CHAT_ID_EN`, `TELEGRAM_NEWS_CHAT_ID_RU`, `TELEGRAM_NEWS_CHAT_ID_DE` | Scheduled: Netlify cron (hourly) | ✅ Active |
| **post-news-to-telegram.js** | Posts news from `forum/topics` (section: "news") to Telegram channels by language, marks `telegramPosted[lang]` | b) News | `FIREBASE_DB_URL`, `TELEGRAM_BOT_TOKEN`, `NEWS_CRON_SECRET`, `TELEGRAM_NEWS_CHAT_ID`, `TELEGRAM_NEWS_CHAT_ID_RU`, `TELEGRAM_NEWS_CHAT_ID_DE` | Manual/cron (not scheduled) | ⚠️ Duplicate? |
| **post-to-telegram.js** | Generic Telegram message sender utility | Utility | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_NEWS_CHAT_ID` or `TELEGRAM_CHAT_ID` | Other functions (internal) | ✅ Active |
| **send-email.js** | Sends contact form emails via SendGrid (to admin + user confirmation), also sends Telegram notification | Utility | `SENDGRID_API_KEY`, `TELEGRAM_BOT_TOKEN` (opt), `TELEGRAM_CHAT_ID` (opt) | Unknown (not found in frontend) | ⚠️ Unused? |
| **test-video.js** | Test stub - returns "test-video function works" | c) Video Jobs | None | None | ❌ Test/Legacy |
| **video-worker-background.js** | Main video worker - processes `videoJobs/` queue, generates video via pipeline, posts to Telegram | c) Video Jobs, d) YouTube/TikTok | `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_DB_URL` or `FIREBASE_DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_NEWS_CHAT_ID_*` (per lang), `OPENAI_TTS_MODEL` (via pipeline) | Scheduled: Netlify cron (every 15 min) | ✅ Active |

---

## Category Breakdown

### a) Domovoy Assistant Functions (4)
1. **ai-domovoy.js** - Main assistant (called from frontend)
2. **ai-voice.js** - Standalone TTS utility
3. **domovoy-auto-post.js** - Auto-generates posts
4. **domovoy-auto-reply.js** - Auto-replies to comments
5. **domovoy-reply.js** - Alternative reply function (duplicate?)

### b) News Generation/Broadcast Functions (3)
1. **fetch-news.js** - Fetches and processes RSS news
2. **news-cron.js** - Scheduled news broadcaster to Telegram
3. **post-news-to-telegram.js** - Alternative news broadcaster (duplicate?)

### c) Video Jobs Queue Functions (6)
1. **create-video-job.js** - Creates video jobs in Firebase
2. **auto-create-video-job.js** - Stub/test function
3. **generate-video.js** - HTTP trigger for video generation
4. **generate-video-background.js** - Background video generator
5. **test-video.js** - Test stub
6. **video-worker-background.js** - Main video queue processor

### d) YouTube/TikTok Posting Functions (1)
1. **video-worker-background.js** - Handles video posting (currently only Telegram, YouTube code not found in Netlify functions)

**Note:** YouTube upload functionality appears to be in `server/video-worker.js` (separate server), not in Netlify functions. The `video-worker-background.js` only posts to Telegram.

---

## Issues Identified

### ❌ Duplicates / Legacy / Unused Functions

1. **auto-create-video-job.js** - Stub/test function, returns hardcoded test response. **Recommendation:** Remove or implement properly.

2. **hello.js** - Test function. **Recommendation:** Remove if not needed for testing.

3. **test-video.js** - Test stub. **Recommendation:** Remove if not needed for testing.

4. **domovoy-reply.js** vs **domovoy-auto-reply.js** - Both reply to forum comments:
   - `domovoy-reply.js`: Replies to any comments in "news" section, marks `domovoyReplied: true`, max 3 replies
   - `domovoy-auto-reply.js`: Replies only to comments in Domovoy-created topics, max 5 replies, looks for questions with "?"
   - **Recommendation:** Review if both are needed or if one can be removed/merged.

5. **news-cron.js** vs **post-news-to-telegram.js** - Both post news to Telegram:
   - `news-cron.js`: Scheduled, posts to all 3 language channels, marks `telegramPostedAt`
   - `post-news-to-telegram.js`: Manual trigger, posts per language, marks `telegramPosted[langCode]`
   - **Recommendation:** Consolidate into one function or clarify use cases.

6. **ai-voice.js** - Standalone TTS utility. **Recommendation:** Check if used anywhere; if not, consider removing or document usage.

7. **send-email.js** - Contact form handler. **Recommendation:** Not found in frontend code; verify if used or remove.

---

## Environment Variables Summary

### Required by Multiple Functions
- `OPENAI_API_KEY` - Used by: ai-domovoy, ai-voice, domovoy-auto-post, domovoy-auto-reply, domovoy-reply, fetch-news, video-worker-background (via pipeline)
- `FIREBASE_DB_URL` or `FIREBASE_DATABASE_URL` - Used by: ai-domovoy, create-video-job, domovoy-auto-post, domovoy-auto-reply, domovoy-reply, fetch-news, news-cron, post-news-to-telegram, video-worker-background
- `FIREBASE_SERVICE_ACCOUNT_JSON` - Used by: create-video-job, video-worker-background
- `TELEGRAM_BOT_TOKEN` - Used by: news-cron, post-news-to-telegram, post-to-telegram, send-email, video-worker-background
- `TELEGRAM_NEWS_CHAT_ID_*` - Used by: news-cron, post-news-to-telegram, video-worker-background

### Function-Specific
- `DOMOVOY_CRON_SECRET` - domovoy-auto-post, domovoy-auto-reply
- `DOMOVOY_REPLY_CRON_SECRET` - domovoy-reply
- `NEWS_CRON_SECRET` - fetch-news, news-cron, post-news-to-telegram
- `SENDGRID_API_KEY` - send-email
- `OPENAI_MODEL` - ai-domovoy, domovoy-auto-post, domovoy-auto-reply, domovoy-reply, fetch-news
- `OPENAI_TTS_MODEL` - ai-domovoy, ai-voice, video-worker-background (via pipeline)
- `OPENAI_TTS_VOICE` - ai-domovoy

---

## Scheduled Functions (netlify.toml)

1. **news-cron** - Every hour (`0 * * * *`) → calls `fetch-news.js`
2. **video-worker** - Every 15 minutes (`*/15 * * * *`) → calls `video-worker-background.js`

---

## Recommendations for Cleanup

### High Priority
1. **Remove test stubs:**
   - `auto-create-video-job.js` (or implement properly)
   - `hello.js`
   - `test-video.js`

2. **Consolidate duplicate functions:**
   - Merge `domovoy-reply.js` and `domovoy-auto-reply.js` or document why both are needed
   - Merge `news-cron.js` and `post-news-to-telegram.js` or clarify use cases

3. **Verify unused functions:**
   - Check if `ai-voice.js` is used anywhere
   - Check if `send-email.js` is called from frontend (not found in current codebase)

### Medium Priority
1. Document why `domovoy-reply.js` and `domovoy-auto-reply.js` both exist
2. Document why `news-cron.js` and `post-news-to-telegram.js` both exist
3. Add comments explaining the difference between `generate-video.js` and `generate-video-background.js`

### Low Priority
1. Consider renaming functions for clarity (e.g., `news-cron.js` → `news-broadcast.js`)
2. Standardize environment variable naming (some use `FIREBASE_DB_URL`, others `FIREBASE_DATABASE_URL`)

---

## Approval Request

**Recommended actions requiring approval:**

1. ✅ **Remove:** `auto-create-video-job.js`, `hello.js`, `test-video.js`
2. ⚠️ **Review & Consolidate:** `domovoy-reply.js` + `domovoy-auto-reply.js`
3. ⚠️ **Review & Consolidate:** `news-cron.js` + `post-news-to-telegram.js`
4. ⚠️ **Verify Usage:** `ai-voice.js`, `send-email.js`

**Would you like me to proceed with any of these cleanup actions?**


