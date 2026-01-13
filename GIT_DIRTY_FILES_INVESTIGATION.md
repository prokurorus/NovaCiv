# Git Dirty Status Investigation Report
## Server-Only Files Analysis

**Date:** 2026-01-11  
**Investigator:** Auto (Cursor AI)  
**Context:** Server in pull-only mode, `onebigstep:health` reported git status: dirty

---

## Executive Summary

Three files are causing git dirty status on the server:
1. ✅ **`docs/START_HERE.md`** - EXISTS in GitHub main, clean (no diff)
2. ❌ **`netlify/lib/newsQueue.js`** - MISSING from GitHub main, REQUIRED by code
3. ❌ **`server/nova-news-worker.js`** - MISSING from GitHub main, MENTIONED in docs

**Critical Finding:** `netlify/lib/newsQueue.js` is **required** by multiple Netlify functions but **does not exist** in GitHub main. This is a **broken dependency**.

---

## Detailed Analysis

### 1. `docs/START_HERE.md`

**Status:** ✅ **EXISTS in GitHub main**

**Git History:**
- Added in commit: `0a56017` ("docs: add START_HERE entry point")
- Present in current HEAD
- No uncommitted changes detected

**Content Analysis:**
- Purpose: Entry point documentation for NovaCiv project
- Content: Quick reference for prod setup, PM2 processes, project memory, first checks, rules
- Used by: Documentation system, ops team reference

**Decision:** ✅ **KEEP** - Already canonical in GitHub, no action needed

---

### 2. `netlify/lib/newsQueue.js`

**Status:** ❌ **MISSING from GitHub main** (exists in commit history only)

**Git History:**
- Added in commit: `a6ef64c` ("feat: add nova-news-worker for PM2 news queue processing")
- **NOT present in current HEAD** (was removed or never merged to main)
- **REQUIRED by code** - Multiple Netlify functions import this module

**Dependencies (Files that require this module):**
1. `netlify/functions/fetch-news.js` (line 19)
2. `netlify/functions/news-cron.js` (line 16)
3. `netlify/functions/ops-run-now.js` (line 13)

**Expected Content (from commit a6ef64c):**
```javascript
// netlify/lib/newsQueue.js
// Utility for enqueueing news processing jobs to Firebase queue
// Used by Netlify functions to quickly enqueue jobs and return

const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;

async function enqueueNewsJob({ requestedBy, dry = false, lang = null }) {
  // Enqueues job to Firebase /newsJobs/pending/{jobId}
  // Returns { jobId, ok: true }
}

module.exports = { enqueueNewsJob };
```

**Architecture Context:**
- Part of "ARCHITECTURE v2" migration
- Netlify functions should enqueue jobs to Firebase queue
- Server-side `nova-news-worker.js` should process jobs
- Current state: **BROKEN** - functions try to require missing module

**Impact:**
- ⚠️ **CRITICAL** - Netlify functions will fail at runtime when trying to require this module
- Functions affected: `fetch-news`, `news-cron`, `ops-run-now`
- Current workaround: Functions may have fallback code, but enqueue pattern is broken

**Decision:** ✅ **ADD to GitHub** - Required dependency, must be canonical

---

### 3. `server/nova-news-worker.js`

**Status:** ❌ **MISSING from GitHub main** (exists in commit history only)

**Git History:**
- Added in commit: `a6ef64c` ("feat: add nova-news-worker for PM2 news queue processing")
- **NOT present in current HEAD** (was removed or never merged to main)
- **MENTIONED in documentation** but not actively used

**Documentation References:**
- `docs/START_HERE.md` (line 9): "`nova-news-worker` (deploy separately when needed)"
- `netlify/functions/news-cron.js` (line 4): "Processing happens on server via nova-news-worker (PM2)"
- `netlify/functions/fetch-news.js` (line 4): "Processing happens on server via nova-news-worker (PM2)"
- `netlify/functions/ops-run-now.js` (line 8): "Processing happens on server via nova-news-worker (PM2)"

**Expected Content (from commit a6ef64c):**
```javascript
// server/nova-news-worker.js
// News processing worker for PM2
// Processes jobs from Firebase queue (/newsJobs/pending)
// Architecture:
// 1) Pulls pending jobs from /newsJobs/pending
// 2) Claims job atomically (moves to /newsJobs/claimed)
// 3) Processes job (fetch-news or news-cron logic)
// 4) Marks job as done or failed
```

**Current State:**
- **NOT running on prod** (per `docs/START_HERE.md`: "What must NOT run on prod: `nova-news-worker`")
- Architecture v2 migration appears **incomplete**
- Netlify functions still contain old processing code (lines 652-923 in `news-cron.js`, lines 866-1234 in `fetch-news.js`)
- Functions have both old direct processing AND new enqueue pattern (hybrid state)

**Impact:**
- ⚠️ **MODERATE** - Worker is not currently used, but architecture expects it
- If `newsQueue.js` is added, worker should be implemented to process jobs
- Currently, news processing happens directly in Netlify functions (old pattern)

**Decision:** ⚠️ **CONDITIONAL** - Add if architecture v2 is to be completed, otherwise remove references

---

## Decision Table

| File | Exists in GitHub | Purpose | Used By | Action |
|------|-----------------|---------|---------|--------|
| `docs/START_HERE.md` | ✅ Yes | Entry point documentation | Documentation, ops team | ✅ **KEEP** (already canonical) |
| `netlify/lib/newsQueue.js` | ❌ No | Enqueue news jobs to Firebase | `fetch-news.js`, `news-cron.js`, `ops-run-now.js` | ✅ **ADD** (required dependency) |
| `server/nova-news-worker.js` | ❌ No | Process news jobs from queue | Architecture v2 (not currently active) | ⚠️ **ADD or REMOVE** (see recommendations) |

---

## Recommendations

### Immediate Actions (Critical)

1. **ADD `netlify/lib/newsQueue.js` to GitHub main**
   - **Reason:** Required by 3 Netlify functions
   - **Impact:** Functions will fail without this module
   - **Action:** Restore from commit `a6ef64c` or recreate based on expected interface
   - **Priority:** 🔴 **HIGH** - System is currently broken

### Architecture Decision Required

2. **Decide on Architecture v2 completion**
   
   **Option A: Complete Architecture v2 (Recommended)**
   - Add `server/nova-news-worker.js` to GitHub
   - Implement job processing logic
   - Remove old processing code from Netlify functions
   - Deploy worker as PM2 process (when needed)
   - **Benefit:** Clean separation, scalable architecture
   
   **Option B: Revert to Architecture v1**
   - Remove `newsQueue.js` requirement from Netlify functions
   - Remove references to `nova-news-worker` from docs/comments
   - Keep direct processing in Netlify functions
   - **Benefit:** Simpler, current state works

### Recommended Path: Option A (Complete v2)

**Rationale:**
- Code already references v2 architecture
- `newsQueue.js` is already required (broken state)
- Better separation of concerns
- Scalable for future growth

**Steps:**
1. ✅ Add `netlify/lib/newsQueue.js` (restore from commit)
2. ✅ Add `server/nova-news-worker.js` (restore and complete implementation)
3. ✅ Remove old processing code from Netlify functions (lines 652-923 in `news-cron.js`, etc.)
4. ✅ Update documentation to reflect active architecture
5. ✅ Test end-to-end: enqueue → process → complete

---

## PR Plan (If Option A is chosen)

### PR Title
`fix: restore missing newsQueue and nova-news-worker for architecture v2`

### PR Description
```
Restores missing files required for Architecture v2 news processing:

1. netlify/lib/newsQueue.js - Required by fetch-news, news-cron, ops-run-now
2. server/nova-news-worker.js - PM2 worker for processing news jobs

These files were added in commit a6ef64c but were missing from main branch,
causing broken dependencies in Netlify functions.

Files restored from commit history and verified against expected interface.
```

### Files to Include
- ✅ `netlify/lib/newsQueue.js` (restore from a6ef64c)
- ✅ `server/nova-news-worker.js` (restore from a6ef64c, complete TODO sections)
- ⚠️ Consider: Remove old processing code from Netlify functions (separate PR recommended)

### Testing Checklist
- [ ] Verify `newsQueue.js` exports `enqueueNewsJob` function
- [ ] Verify Netlify functions can require `newsQueue.js`
- [ ] Verify jobs are enqueued to Firebase `/newsJobs/pending`
- [ ] Verify `nova-news-worker.js` can process jobs (when implemented)
- [ ] Verify no runtime errors in Netlify functions

---

## Alternative PR Plan (If Option B is chosen)

### PR Title
`refactor: remove architecture v2 references, revert to direct processing`

### PR Description
```
Removes incomplete Architecture v2 migration:

1. Remove require('newsQueue') from Netlify functions
2. Remove references to nova-news-worker from docs/comments
3. Keep direct processing in Netlify functions (current working state)

This simplifies the codebase and removes broken dependencies.
```

### Files to Modify
- `netlify/functions/fetch-news.js` - Remove `require("../lib/newsQueue")`
- `netlify/functions/news-cron.js` - Remove `require("../lib/newsQueue")`
- `netlify/functions/ops-run-now.js` - Remove `require("../lib/newsQueue")`
- `docs/START_HERE.md` - Remove `nova-news-worker` reference
- Remove old processing code cleanup (if needed)

---

## Summary

**Current State:**
- 🔴 **BROKEN** - `newsQueue.js` is required but missing
- ⚠️ **INCOMPLETE** - Architecture v2 migration started but not finished
- ✅ **CLEAN** - `START_HERE.md` is canonical

**Recommended Action:**
1. **IMMEDIATE:** Add `netlify/lib/newsQueue.js` to fix broken dependencies
2. **DECISION:** Choose Architecture v2 completion (Option A) or revert (Option B)
3. **IF Option A:** Add `server/nova-news-worker.js` and complete implementation
4. **IF Option B:** Remove v2 references and keep direct processing

**Priority:** 🔴 **HIGH** - System has broken dependencies that will cause runtime failures.

---

*Report generated by Auto (Cursor AI) on 2026-01-11*
