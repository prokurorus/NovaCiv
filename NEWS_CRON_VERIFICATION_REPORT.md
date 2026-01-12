# ✅ NEWS-CRON VERIFICATION REPORT

**Date:** 2026-01-11  
**Commit:** `c125082`  
**Status:** ⏳ VERIFICATION REQUIRED

---

## 📋 CHECKLIST

### 1. ✅ Netlify Production Deploy (commit c125082)

**Action Required:** Manual check in Netlify Dashboard

**Steps:**
1. Open Netlify Dashboard → Site → Deploys
2. Find the latest production deploy
3. Verify commit hash is `c125082` (or contains `fix: unblock news-cron schedule`)
4. Verify deploy status is "Published" (not "Draft" or "Failed")

**Expected Result:**
- ✅ Latest production deploy shows commit `c125082`
- ✅ Deploy status is "Published"
- ✅ Deploy timestamp is after push to main

**Status:** ❓ MANUAL CHECK REQUIRED

---

### 2. ✅ Netlify Functions Logs (news-cron)

**Action Required:** Manual check in Netlify Dashboard

**Steps:**
1. Open Netlify Dashboard → Site → Functions → `news-cron`
2. Click "Logs" or "Function logs"
3. Wait for next scheduled run (every hour at :00 minutes) OR use "Manual invoke" if available
4. Check logs for the latest execution

**Expected Results:**
- ✅ **NO** `403 Forbidden: invalid token` errors (for scheduled runs)
- ✅ **NO** `ReferenceError: startTime is not defined`
- ✅ **NO** `ReferenceError: runId is not defined`
- ✅ Status code 200 in response (or 500 with business logic errors, not code errors)
- ✅ Logs show successful execution or clear error messages

**What to Look For:**
```
✅ Good logs:
[news-cron] Processing topics...
Status: 200
Body: {"ok":true,"processed":2,"totalSent":6}

❌ Bad logs (should NOT appear):
Status: 403
Body: {"ok":false,"error":"Forbidden: invalid token"}

ReferenceError: startTime is not defined
```

**Status:** ❓ MANUAL CHECK REQUIRED

---

### 3. ✅ Firebase Health Metrics

**Action Required:** Manual check or script

**Option A: Using Script (if NEWS_CRON_SECRET is set):**
```bash
node scripts/verify-news-cron-fix.mjs
```

**Option B: Manual Check via Health Endpoint:**
1. Get `NEWS_CRON_SECRET` from Netlify Dashboard → Site → Environment variables
2. Open browser:
   ```
   https://novaciv.space/.netlify/functions/health-news?token=[NEWS_CRON_SECRET]
   ```
3. Check JSON response:
   ```json
   {
     "ok": true,
     "cron": {
       "ts": 1704992400000,
       "runId": "news-cron-1704992400000",
       "fetchedTopics": 5,
       "processed": 3,
       "totalSent": 9
     }
   }
   ```

**Option C: Firebase Console:**
1. Open Firebase Console → Realtime Database
2. Navigate to `/health/news/newsCronLastRun`
3. Check timestamp (`ts`) - should update after each news-cron run
4. Check `runId` - should match pattern `news-cron-{timestamp}`

**Expected Results:**
- ✅ `cron.ts` (timestamp) updates after each news-cron execution
- ✅ `cron.runId` exists and matches pattern `news-cron-{timestamp}`
- ✅ Metrics are recent (within last 2 hours if scheduler is running)

**Status:** ❓ VERIFICATION REQUIRED

---

### 4. ✅ Telegram Publication

**Action Required:** Check Telegram channels and Firebase

**Step 1: Check Firebase for Unpublished Topics**
1. Firebase Console → Realtime Database → `/forum/topics`
2. Filter for topics where:
   - `section === "news"`
   - `telegramPostedAt` is missing or `null`

**Step 2: Wait for news-cron Run**
- news-cron runs every hour at :00 minutes
- After run, check if `telegramPostedAt` is set on topics

**Step 3: Check Telegram Channels**
- Check Telegram channels (RU/EN/DE) if accessible
- Verify new posts appear after news-cron execution

**Expected Results:**
- ✅ Topics with `section: "news"` and no `telegramPostedAt` get published
- ✅ After news-cron run, `telegramPostedAt` field is added to topics
- ✅ New posts appear in Telegram channels

**Status:** ❓ VERIFICATION REQUIRED

---

### 5. ✅ Empty Queue Analysis

**If no posts appear:**

**Diagnosis Steps:**

1. **Check if fetch-news is creating topics:**
   - Firebase Console → `/forum/topics`
   - Filter: `section === "news"`
   - Check `createdAt` timestamps
   - If no recent topics (within last 6 hours), fetch-news may not be running

2. **Check if all topics are already published:**
   - Firebase Console → `/forum/topics`
   - Filter: `section === "news"`
   - Check if all topics have `telegramPostedAt` field
   - If all have `telegramPostedAt`, queue is empty (expected behavior)

3. **Check fetch-news schedule:**
   - fetch-news runs every 3 hours: 00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00 UTC
   - Check Netlify Functions logs for `fetch-news` to verify execution

**Solution: Create Test Topic (if needed)**

If queue is empty and you want to test news-cron, create a test topic:

**Option 1: Use Netlify Function (Manual Invoke)**
- Function: `domovoy-auto-post` (creates topics with `section: "news"`)
- Manual invoke from Netlify Dashboard (requires token)

**Option 2: Script to Create Test Topic**

Create file: `scripts/create-test-news-topic.mjs`

```javascript
// scripts/create-test-news-topic.mjs
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "..", ".env") });

const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;
if (!FIREBASE_DB_URL) {
  console.error("❌ FIREBASE_DB_URL not set");
  process.exit(1);
}

const payload = {
  title: "Test News Topic (Verification)",
  content: "This is a test topic created to verify news-cron functionality. It should be published to Telegram channels.",
  section: "news",
  createdAt: Date.now(),
  createdAtServer: Date.now(),
  authorNickname: "NovaCiv Test",
  lang: "en",
  sourceId: "test",
  originalGuid: `test-${Date.now()}`,
  originalLink: "https://novaciv.space",
  pubDate: new Date().toUTCString(),
};

const res = await fetch(`${FIREBASE_DB_URL}/forum/topics.json`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

if (!res.ok) {
  const text = await res.text();
  console.error(`❌ Failed to create test topic: ${res.status} ${text}`);
  process.exit(1);
}

const data = await res.json();
console.log("✅ Test topic created:");
console.log(`   Topic ID: ${data.name}`);
console.log(`   Wait for next news-cron run (every hour at :00) to publish`);
```

Run:
```bash
node scripts/create-test-news-topic.mjs
```

**Status:** ❓ VERIFICATION REQUIRED

---

## 📊 VERIFICATION SUMMARY

| Check | Status | Notes |
|-------|--------|-------|
| Netlify Deploy (c125082) | ❓ | Manual check required |
| Functions Logs (no 403/ReferenceError) | ❓ | Manual check required |
| Health Metrics Updated | ❓ | Can use script or manual |
| Telegram Publication | ❓ | Depends on queue state |
| Empty Queue Analysis | ❓ | If no posts, check diagnosis |

---

## 🎯 EXPECTED BEHAVIOR AFTER FIX

1. ✅ **news-cron runs successfully** every hour (schedule: `0 * * * *`)
2. ✅ **No 403 errors** for scheduled runs (token check is conditional)
3. ✅ **No ReferenceError** (startTime/runId defined at function start)
4. ✅ **Health metrics update** after each run (`/health/news/newsCronLastRun`)
5. ✅ **Topics get published** to Telegram if queue is not empty
6. ✅ **telegramPostedAt field** is added after successful publication

---

## 🔧 NEXT STEPS

1. **Run verification script:**
   ```bash
   node scripts/verify-news-cron-fix.mjs
   ```

2. **Check Netlify Dashboard:**
   - Deploys → verify commit c125082
   - Functions → news-cron → Logs
   - Functions → news-cron → Manual invoke (if needed)

3. **Check Health Endpoint:**
   - Browser: `https://novaciv.space/.netlify/functions/health-news?token=[SECRET]`
   - Or use script above

4. **If queue is empty:**
   - Use `create-test-news-topic.mjs` script to create test topic
   - Wait for next news-cron run (every hour at :00)
   - Verify topic gets `telegramPostedAt` field

---

## 📝 NOTES

- **fetch-news.js health metrics:** Still not implemented (not a blocker, see NEWS_PIPELINE_DIAGNOSIS.md)
- **Scheduled runs:** Netlify scheduled functions don't pass query parameters, so token check is conditional
- **Manual invoke:** If using manual invoke from Netlify Dashboard, token may be required (depends on NEWS_CRON_SECRET configuration)
