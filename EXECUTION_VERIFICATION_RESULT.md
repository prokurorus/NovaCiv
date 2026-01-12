# ✅ NEWS-CRON EXECUTION VERIFICATION RESULT

**Commit:** `c125082`  
**Date:** 2026-01-11  
**Check Period:** Last 2 hours

---

## ⚠️ AUTOMATION LIMITATION

**Cannot verify automatically without:**
- Netlify Dashboard access (function logs)
- `NEWS_CRON_SECRET` environment variable
- `FIREBASE_DB_URL` environment variable (for direct Firebase access)

**Tools Created:**
- ✅ `scripts/check-news-cron-execution.mjs` - Health endpoint + Firebase check script
- ✅ `NEWS_CRON_EXECUTION_CHECK.md` - Detailed verification guide

---

## 📊 VERIFICATION STATUS

| Check | Status | Notes |
|-------|--------|-------|
| **1. Netlify Function Logs** | ❓ **REQUIRES MANUAL** | Netlify Dashboard → Functions → news-cron → Logs |
| **2. Health Metrics** | ❓ **REQUIRES MANUAL** | Health endpoint or script (needs NEWS_CRON_SECRET) |
| **3. Firebase Topics** | ❓ **REQUIRES MANUAL** | Firebase Console or script (needs FIREBASE_DB_URL) |

---

## 🎯 REQUIRED MANUAL CHECKS

### Check 1: Netlify Function Logs

**Location:** Netlify Dashboard → Site → Functions → `news-cron` → Logs

**Verify Last 2 Hours:**
- [ ] Scheduled execution exists (every hour at :00)
- [ ] **NO** `403 Forbidden: invalid token`
- [ ] **NO** `ReferenceError: startTime is not defined`
- [ ] **NO** `ReferenceError: runId is not defined`

**Expected (PASS):**
```
Status: 200
Duration: XXX ms
Body: {"ok":true,"processed":X,"totalSent":Y}
```

**If FAIL - Error Patterns:**
- `403 Forbidden` → Token check issue (should NOT happen after fix)
- `ReferenceError: startTime/runId` → Variable definition issue (should NOT happen after fix)
- Other errors → Check error message

---

### Check 2: Health Metrics

**Option A: Health Endpoint**
```
https://novaciv.space/.netlify/functions/health-news?token=[NEWS_CRON_SECRET]
```

**Option B: Script**
```bash
node scripts/check-news-cron-execution.mjs
```

**Verify:**
- [ ] `newsCronLastRun` exists
- [ ] `cron.ts` timestamp is within last 2 hours
- [ ] `cron.runId` matches pattern `news-cron-{timestamp}`
- [ ] `fetchNewsLastRun` exists (note: fetch-news doesn't write metrics - known issue)

---

### Check 3: Firebase Topics (Candidates)

**Location:** Firebase Console → Realtime Database → `/forum/topics`

**Query:** Topics where `section === "news"` AND `telegramPostedAt` is missing/null

**Verify:**
- [ ] Count of unpublished topics
- [ ] Languages (ru/en/de)
- [ ] CreatedAt timestamps

---

## 📋 DIAGNOSIS DECISION TREE

After performing manual checks, use this to determine status:

### Step 1: Check Logs

**If logs show errors:**
- ❌ **FAIL** → Stop Point: "Netlify Function Logs - [error type]"
- Fix: See error-specific fix below

**If logs show successful execution (Status 200):**
- Continue to Step 2

---

### Step 2: Check Health Metrics

**If `newsCronLastRun` NOT FOUND or timestamp > 2 hours:**
- ❌ **FAIL** → Stop Point: "Health metrics not found/old - news-cron not running"
- Fix: Check Netlify scheduled functions configuration

**If `newsCronLastRun` found and timestamp < 2 hours:**
- Continue to Step 3

---

### Step 3: Analyze Health Metrics

**If `processed = 0` AND `totalSent = 0`:**
- Continue to Step 4 (check Firebase topics)

**If `processed > 0` AND `totalSent = 0`:**
- ❌ **FAIL** → Stop Point: "Telegram send failed - processed but sent=0"
- Fix: Check TELEGRAM_BOT_TOKEN, TELEGRAM_NEWS_CHAT_ID_* env vars

**If `processed > 0` AND `totalSent > 0`:**
- ✅ **PASS** → Stop Point: "All checks passed"
- Fix: None

---

### Step 4: Check Firebase Topics

**If NO unpublished topics (all have `telegramPostedAt`):**
- ✅ **PASS** → Stop Point: "Queue empty - all topics published"
- Fix: None (normal state)

**If unpublished topics exist BUT `processed = 0`:**
- ❌ **FAIL** → Stop Point: "Filter/logic issue - topics exist but processed=0"
- Fix: Check news-cron filter conditions (section="news", !telegramPostedAt)

---

## 🔍 SPECIFIC FAILURE POINTS & FIXES

### 1. "нет свежих topics"

**Symptoms:**
- Health: `processed = 0`
- Firebase: All topics have `telegramPostedAt` OR no topics with `section="news"`

**Status:** ✅ **PASS** (normal state)

**Stop Point:** Queue empty - all topics published or no topics exist

**Fix:** 
- Wait for fetch-news to create topics (runs every 3 hours)
- Or create test topic: `node scripts/create-test-news-topic.mjs`

---

### 2. "нет telegram env"

**Symptoms:**
- Health: `processed > 0`, `totalSent = 0`
- Logs: No Telegram errors, but sends skipped
- `perLanguage`: All show `sent: 0`

**Status:** ❌ **FAIL**

**Stop Point:** Telegram environment variables missing

**Fix:** Check Netlify environment variables:
- `TELEGRAM_BOT_TOKEN` (required)
- `TELEGRAM_NEWS_CHAT_ID_EN` (optional)
- `TELEGRAM_NEWS_CHAT_ID_RU` (optional)
- `TELEGRAM_NEWS_CHAT_ID_DE` (optional)

**Minimal Fix:** Set `TELEGRAM_BOT_TOKEN` and at least one `TELEGRAM_NEWS_CHAT_ID_*`

---

### 3. "ошибка отправки telegram"

**Symptoms:**
- Health: `processed > 0`, `totalSent = 0` or `totalSent < processed * 3`
- Logs: Telegram API errors (401, 403, 429, etc.)

**Status:** ❌ **FAIL**

**Stop Point:** Telegram API error - [specific error from logs]

**Fix:** Check logs for specific error:
- `401 Unauthorized` → Invalid TELEGRAM_BOT_TOKEN
- `403 Forbidden` → Bot doesn't have access to chat
- `429 Too Many Requests` → Rate limit, wait and retry
- `400 Bad Request` → Invalid chat_id or message format

**Minimal Fix:** Fix the specific Telegram API error (token, chat_id, permissions)

---

### 4. "не тот фильтр section/lang"

**Symptoms:**
- Firebase: Unpublished topics exist
- Health: `processed = 0`
- Topics have `section="news"` but filter doesn't match

**Status:** ❌ **FAIL**

**Stop Point:** Filter condition mismatch - topics exist but not processed

**Check Code:**
```javascript
// netlify/functions/news-cron.js line 90
const url = `${FIREBASE_DB_URL}/forum/topics.json?orderBy=%22section%22&equalTo=%22news%22`;
// Filters: section === "news"

// Line 178
.filter((t) => !t.telegramPostedAt)
// Filters: telegramPostedAt is missing/null
```

**Fix:** Verify topic structure matches filter:
- Topics MUST have `section: "news"` (exact match, case-sensitive)
- Topics MUST NOT have `telegramPostedAt` field (or it must be null/undefined)

**Minimal Fix:** Ensure topics are created with correct structure (section="news", no telegramPostedAt)

---

## 📝 RESULT TEMPLATE

Fill in after manual checks:

```
Status: [PASS/FAIL]

Stop Point: [exact location/condition]

Fix: [minimal fix required]

Details:
- Logs: [errors/clean, execution found/not found]
- Health Metrics: [found/not found, timestamp, processed, totalSent]
- Firebase Topics: [unpublished count, languages]
- Telegram: [sent count, errors]
```

---

## 🔧 QUICK REFERENCE

**Run Verification Script:**
```bash
node scripts/check-news-cron-execution.mjs
```

**Create Test Topic:**
```bash
node scripts/create-test-news-topic.mjs
```

**Health Endpoint:**
```
https://novaciv.space/.netlify/functions/health-news?token=[NEWS_CRON_SECRET]
```

**Full Guide:** See `NEWS_CRON_EXECUTION_CHECK.md`

---

**Note:** Full verification requires manual access to Netlify Dashboard, health endpoint (with token), and Firebase Console. Automated checks are limited to code verification (which passes - commit c125082 is correct).
