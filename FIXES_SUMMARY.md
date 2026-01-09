# NovaCiv Video Worker v2 - Fixes Summary

This document summarizes all fixes applied to eliminate manual editing, make server behavior deterministic, and prevent recurring failures.

## Changes Overview

### 1. Deterministic ENV Loading ✅

**Problem**: `dotenv.config()` depended on current working directory, causing failures when run from `/root`.

**Solution**: Use absolute paths for `.env` file loading.

**Files Changed**:
- `server/video-worker.js`: Now uses `/root/NovaCiv/.env` absolute path
- `scripts/setup-firebase-config.js`: Now uses `/root/NovaCiv/.env` absolute path

**Impact**: Environment variables load correctly regardless of current working directory.

---

### 2. Firebase Admin Init Safety ✅

**Problem**: Multiple initialization attempts could cause errors.

**Solution**: Added `admin.apps.length` check before initialization.

**Files Changed**:
- `server/config/firebase-config.js`: Added singleton guard with `if (!admin.apps.length)`

**Impact**: Safe repeated initialization, no duplicate app errors.

---

### 3. Feature Flags Access Improvement ✅

**Problem**: Two separate calls to `getFeatureFlag()` per loop iteration.

**Solution**: Single call to `getFeatureFlags()` per iteration.

**Files Changed**:
- `server/video-worker.js`: Replaced two `getFeatureFlag()` calls with one `getFeatureFlags()` call

**Impact**: Reduced Firebase reads, better performance, consistent flag state.

---

### 4. Atomic Job Claim (Queue Locking) ✅

**Problem**: Two workers could process the same job (race condition).

**Solution**: Implemented Firebase RTDB transaction for atomic job claiming.

**Files Changed**:
- `server/video-worker.js`: Replaced simple `update()` with `transaction()` for job claiming

**Features**:
- Atomic claim: Only one worker can claim a job
- Stale job recovery: Jobs stuck in "processing" for >30 minutes can be reclaimed
- Worker identification: Each claim includes `lockedBy` and `lockedAt` fields

**Impact**: Prevents duplicate job processing even if multiple workers exist.

---

### 5. Single Owner of Job Processing ✅

**Problem**: Both PM2 worker and Netlify function could process jobs, causing duplicates.

**Solution**: Disabled Netlify function from processing jobs. PM2 worker is the ONLY processor.

**Files Changed**:
- `netlify/functions/video-worker.js`: Returns early with disabled message

**Architecture**:
- **Job Creation**: `netlify/functions/create-video-job.js` (creates jobs with `status: "pending"`)
- **Job Processing**: `server/video-worker.js` (PM2) - ONLY processor
- **Netlify Function**: Disabled (returns early, kept for backward compatibility)

**Impact**: Single source of truth for job processing, no race conditions.

---

### 6. YouTube invalid_grant Detection & CLI ✅

**Problem**: `invalid_grant` errors were cryptic, no easy way to regenerate tokens.

**Solution**: Added detailed error detection and CLI tool for token regeneration.

**Files Changed**:
- `server/youtube.js`: Added `invalid_grant` detection with actionable error messages
- `scripts/youtube-auth-cli.js`: New CLI tool for OAuth token regeneration

**Features**:
- Detects `invalid_grant` errors with clear explanations
- CLI tool guides user through OAuth flow
- Outputs refresh token ready to copy to server `.env`

**Impact**: Easier troubleshooting and token regeneration.

---

### 7. Deployment Script (Zero Manual Editing) ✅

**Problem**: Manual deployment steps (git pull, npm install, pm2 restart) prone to errors.

**Solution**: Single-command deployment script.

**Files Changed**:
- `scripts/deploy-server.sh`: New deployment script

**Features**:
- Single command: `bash scripts/deploy-server.sh`
- Automatic: git pull, npm ci, pm2 restart, verification
- Error handling: Stops on any error with clear messages

**Impact**: Eliminates manual editing, deterministic deployment.

---

### 8. Documentation Updates ✅

**Files Changed**:
- `MIGRATION_GUIDE.md`: Added YouTube token regeneration section
- `DEPLOYMENT_CHECKLIST.md`: New comprehensive deployment verification checklist

**Impact**: Clear instructions for deployment and troubleshooting.

---

## Architecture Summary

### Job Processing Flow

```
1. create-video-job.js (Netlify) → Creates job with status: "pending"
2. server/video-worker.js (PM2) → Atomically claims and processes job
3. netlify/functions/video-worker.js → DISABLED (returns early)
```

### Feature Flags Flow

```
1. Firebase config/features/ → Source of truth
2. server/config/feature-flags.js → Loads with 30s cache
3. server/video-worker.js → Uses flags (single call per loop)
```

### Environment Variables

```
1. /root/NovaCiv/.env → Absolute path (no CWD dependence)
2. dotenv.config({ path: "/root/NovaCiv/.env" }) → Deterministic loading
3. Used only for secrets (not feature flags)
```

---

## Deployment Instructions

### One-Command Deployment

```bash
bash scripts/deploy-server.sh
```

### Manual Deployment (Alternative)

```bash
ssh root@77.42.36.198 "cd /root/NovaCiv && git pull && npm ci && pm2 restart 0 && pm2 save"
```

---

## Verification Checklist

See `DEPLOYMENT_CHECKLIST.md` for detailed verification steps.

Quick checks:
1. ✅ PM2 status shows `nova-video` online
2. ✅ Logs show feature flags loaded from Firebase
3. ✅ Only one processor (PM2) active
4. ✅ Atomic job claim works (no duplicates)
5. ✅ YouTube upload respects Firebase flags
6. ✅ Environment variables load correctly

---

## Breaking Changes

### Removed
- Netlify function `video-worker.js` no longer processes jobs (disabled)

### Changed
- `.env` loading now uses absolute path (no CWD dependence)
- Feature flags must be in Firebase (not `.env`)

### Added
- Atomic job claiming (transactions)
- YouTube token regeneration CLI
- Deployment script

---

## Files Modified

1. `server/video-worker.js` - Main worker (env loading, feature flags, atomic claims)
2. `server/config/firebase-config.js` - Safe singleton init
3. `server/youtube.js` - Error detection
4. `scripts/setup-firebase-config.js` - Absolute env path
5. `netlify/functions/video-worker.js` - Disabled processing
6. `scripts/youtube-auth-cli.js` - New CLI tool
7. `scripts/deploy-server.sh` - New deployment script
8. `MIGRATION_GUIDE.md` - YouTube token section
9. `DEPLOYMENT_CHECKLIST.md` - New verification guide

---

## Testing Recommendations

1. **Deploy to staging first** (if available)
2. **Monitor logs** for first few jobs after deployment
3. **Verify atomic claims** by checking for duplicate processing
4. **Test feature flags** by toggling in Firebase
5. **Test YouTube upload** (if enabled) to verify token validity

---

## Support

For issues or questions:
1. Check `DEPLOYMENT_CHECKLIST.md` for verification steps
2. Check `MIGRATION_GUIDE.md` for YouTube token regeneration
3. Review PM2 logs: `pm2 logs nova-video`
4. Check Firebase: `config/features/` path


