# ✅ NEWS-CRON EXECUTION VERIFICATION

**Commit:** `c125082`  
**Date:** 2026-01-11  
**Check Period:** Last 2 hours

---

## 🔍 VERIFICATION CHECKLIST

### 1. Netlify Function Logs (news-cron)

**Location:** Netlify Dashboard → Site → Functions → `news-cron` → Logs

**Check Last 2 Hours:**
- [ ] Scheduled execution exists (every hour at :00)
- [ ] NO `403 Forbidden: invalid token` errors
- [ ] NO `ReferenceError: startTime is not defined`
- [ ] NO `ReferenceError: runId is not defined`
- [ ] Status 200 or clear error messages

**Expected Log Pattern (SUCCESS):**
```
Status: 200
Duration: XXX ms
Body: {"ok":true,"processed":2,"totalSent":6,"perLanguage":{...}}
```

**Error Patterns to Check:**
```
❌ Status: 403
   Body: {"ok":false,"error":"Forbidden: invalid token"}
   → Token check blocking scheduled runs (SHOULD NOT HAPPEN after fix)

❌ ReferenceError: startTime is not defined
   → Variables not defined correctly (SHOULD NOT HAPPEN after fix)

❌ ReferenceError: runId is not defined
   → Variables not defined correctly (SHOULD NOT HAPPEN after fix)
```

---

### 2. Health Metrics Check

**Option A: Health Endpoint**
```
https://novaciv.space/.netlify/functions/health-news?token=[NEWS_CRON_SECRET]
```

**Option B: Script**
```bash
node scripts/check-news-cron-execution.mjs
```

**Check:**
- [ ] `newsCronLastRun` exists and updated
- [ ] `cron.ts` timestamp is within last 2 hours
- [ ] `cron.runId` matches pattern `news-cron-{timestamp}`
- [ ] `fetchNewsLastRun` exists (if not, note: fetch-news doesn't write metrics)

**Expected Response:**
```json
{
  "ok": true,
  "cron": {
    "ts": 1704992400000,
    "runId": "news-cron-1704992400000",
    "fetchedTopics": 5,
    "processed": 3,
    "totalSent": 9,
    "perLanguage": {
      "ru": {"sent": 3},
      "en": {"sent": 3},
      "de": {"sent": 3}
    }
  },
  "fetch": {
    "ts": 1704988800000,
    "processed": 2
  }
}
```

---

### 3. Firebase Topics Check (Candidates for Posting)

**Location:** Firebase Console → Realtime Database → `/forum/topics`

**Query:** Topics with `section === "news"` and `telegramPostedAt` is missing/null

**Check:**
- [ ] Count of unpublished topics (section="news", no telegramPostedAt)
- [ ] Languages of unpublished topics (ru/en/de)
- [ ] CreatedAt timestamps (should be recent if fetch-news is working)

**Expected:** 
- Unpublished topics exist → candidates for posting
- No unpublished topics → queue empty (all published or no topics)

---

## 📊 DIAGNOSIS MATRIX

### Scenario 1: Health Metrics Show Recent Execution

**If `cron.ts` is within last 2 hours:**

| Condition | Status | Stop Point | Fix |
|-----------|--------|------------|-----|
| `processed > 0`, `totalSent > 0` | ✅ PASS | - | None |
| `processed > 0`, `totalSent = 0` | ❌ FAIL | Telegram send failed | Check TELEGRAM_BOT_TOKEN, TELEGRAM_NEWS_CHAT_ID_* |
| `processed = 0`, unpublished topics exist | ❌ FAIL | Filter/logic issue | Check news-cron filter conditions, logs |
| `processed = 0`, no unpublished topics | ✅ PASS | Queue empty | Normal: all published or no topics |

### Scenario 2: Health Metrics Not Found or Old

**If `cron.ts` is missing or > 2 hours old:**

| Condition | Status | Stop Point | Fix |
|-----------|--------|------------|-----|
| No metrics at all | ❌ FAIL | news-cron not running | Check Netlify scheduled functions config |
| Metrics > 2 hours old | ❌ FAIL | Scheduler stopped | Check Netlify scheduled functions status |

### Scenario 3: Logs Show Errors

**If logs show errors:**

| Error | Status | Stop Point | Fix |
|-------|--------|------------|-----|
| `403 Forbidden: invalid token` | ❌ FAIL | Token check blocking | Verify token check fix in code (should be conditional) |
| `ReferenceError: startTime/runId` | ❌ FAIL | Variables not defined | Verify variable definitions (should be at function start) |
| Telegram API error | ❌ FAIL | Telegram send failed | Check TELEGRAM_BOT_TOKEN, TELEGRAM_NEWS_CHAT_ID_* |
| Firebase error | ❌ FAIL | Database access failed | Check FIREBASE_DB_URL, Firebase permissions |

---

## 🎯 SPECIFIC FAILURE POINTS

### A. "нет свежих topics"

**Symptoms:**
- Health metrics show `processed = 0`
- Firebase shows no topics with `section="news"` and no `telegramPostedAt`
- All topics have `telegramPostedAt` field

**Diagnosis:** Queue is empty - all topics already published

**Fix:** 
- Wait for fetch-news to create new topics (runs every 3 hours)
- Or create test topic: `node scripts/create-test-news-topic.mjs`

---

### B. "нет telegram env"

**Symptoms:**
- Health metrics show `processed > 0` but `totalSent = 0`
- Logs show Telegram errors or skipped sends
- `perLanguage` shows all `sent: 0`

**Diagnosis:** Telegram environment variables missing or invalid

**Fix:** Check Netlify environment variables:
- `TELEGRAM_BOT_TOKEN` (required)
- `TELEGRAM_NEWS_CHAT_ID_EN` (optional but needed for EN posts)
- `TELEGRAM_NEWS_CHAT_ID_RU` (optional but needed for RU posts)
- `TELEGRAM_NEWS_CHAT_ID_DE` (optional but needed for DE posts)

---

### C. "ошибка отправки telegram"

**Symptoms:**
- Health metrics show `processed > 0` but `totalSent = 0` or `totalSent < processed * 3`
- Logs show Telegram API errors (status codes, rate limits, etc.)

**Diagnosis:** Telegram API returned errors (invalid token, rate limit, chat not found, etc.)

**Fix:** Check logs for specific Telegram API error message

---

### D. "не тот фильтр section/lang"

**Symptoms:**
- Unpublished topics exist in Firebase
- Health metrics show `processed = 0`
- Topics have `section="news"` but filter doesn't match

**Diagnosis:** Filter condition in news-cron doesn't match topics

**Check Code:**
```javascript
// netlify/functions/news-cron.js line 90
const url = `${FIREBASE_DB_URL}/forum/topics.json?orderBy=%22section%22&equalTo=%22news%22`;
// Should match topics with section="news"

// Line 182
.filter((t) => !t.telegramPostedAt)
// Should filter out already published topics
```

**Fix:** Verify topic structure matches filter (section="news", telegramPostedAt missing)

---

## 📝 VERIFICATION RESULT TEMPLATE

**After checking all items above, fill in:**

```
Status: [PASS/FAIL]
Stop Point: [exact location/condition where it stops]
Fix: [minimal fix required]

Details:
- Health Metrics: [found/not found, timestamp]
- Logs: [errors found/clean]
- Topics: [unpublished count, languages]
- Telegram: [sent count, errors]
```

---

## 🔧 QUICK FIXES

### If news-cron not running:
1. Check Netlify scheduled functions configuration
2. Verify deploy is published (commit c125082)
3. Check Netlify function logs for errors

### If processed=0 but topics exist:
1. Check filter conditions match topic structure
2. Verify topics have `section="news"` (exact match)
3. Verify topics don't have `telegramPostedAt` field

### If totalSent=0:
1. Check TELEGRAM_BOT_TOKEN env var
2. Check TELEGRAM_NEWS_CHAT_ID_* env vars
3. Check Telegram API errors in logs

### If queue empty:
1. Check fetch-news is running (every 3 hours)
2. Create test topic: `node scripts/create-test-news-topic.mjs`
3. Wait for next news-cron run (every hour at :00)

---

## 📚 TOOLS

- **Check Script:** `scripts/check-news-cron-execution.mjs`
- **Create Test Topic:** `scripts/create-test-news-topic.mjs`
- **Health Endpoint:** `https://novaciv.space/.netlify/functions/health-news?token=[SECRET]`
