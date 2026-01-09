# NovaCiv Video Worker v2 - Deployment Checklist

## One-Command Deployment

From your PC, run:

```bash
bash scripts/deploy-server.sh
```

This will:
- Pull latest code from git
- Install dependencies (`npm ci`)
- Restart PM2 worker
- Verify deployment

## Manual Deployment (Alternative)

If you prefer manual deployment:

```bash
ssh root@77.42.36.198 "cd /root/NovaCiv && git pull && npm ci && pm2 restart 0 && pm2 save"
```

## Post-Deployment Verification

### 1. Check PM2 Status

```bash
ssh root@77.42.36.198 "pm2 status"
```

Expected output:
- `nova-video` process should be `online`
- Status should show `restart: 0` (no crashes)

### 2. Check Logs for Feature Flags

```bash
ssh root@77.42.36.198 "pm2 logs nova-video --lines 50 | grep -E 'feature flags|Firebase initialized'"
```

Expected output:
```
[worker] Firebase initialized
[worker] feature flags: { youtubeUploadEnabled: false, telegramEnabled: true }
```

**Verify:**
- ✅ Flags are loaded from Firebase (not hardcoded)
- ✅ Default values are safe (youtubeUploadEnabled=false if Firebase read fails)

### 3. Verify Single Processor

```bash
# Check PM2 processes
ssh root@77.42.36.198 "pm2 list"

# Check if Netlify function is disabled (should return disabled message)
# (This is automatic - netlify/functions/video-worker.js returns early)
```

**Verify:**
- ✅ Only ONE PM2 process (`nova-video`) processes jobs
- ✅ Netlify function `video-worker.js` is disabled (returns early with message)

### 4. Test Atomic Job Claim

Create a test job and monitor logs:

```bash
# Watch logs in real-time
ssh root@77.42.36.198 "pm2 logs nova-video --raw" | grep -E 'claim|transaction|locked'
```

Expected behavior:
- ✅ Job is claimed atomically (transaction succeeds)
- ✅ Log shows `successfully claimed job` with worker ID
- ✅ If two workers try to claim same job, only one succeeds

### 5. Verify YouTube Upload Behavior

**If `youtubeUploadEnabled = false` in Firebase:**
```bash
ssh root@77.42.36.198 "pm2 logs nova-video --lines 100 | grep youtube"
```

Expected:
```
[youtube] disabled via feature flag, skipping
```

**If `youtubeUploadEnabled = true` in Firebase:**
- Check logs for YouTube upload attempts
- If `invalid_grant` error appears, see YouTube token regeneration section below

### 6. Check Environment Loading

```bash
# Verify .env is loaded with absolute path (no CWD issues)
ssh root@77.42.36.198 "cd /tmp && node -e \"require('dotenv').config({path: '/root/NovaCiv/.env'}); console.log('YOUTUBE_CLIENT_ID:', process.env.YOUTUBE_CLIENT_ID ? 'SET' : 'MISSING')\""
```

Expected:
- ✅ Environment variables are loaded correctly
- ✅ No "Cannot find module 'dotenv'" errors
- ✅ Works from any directory (absolute path)

### 7. Verify Firebase Admin Init Safety

Check logs for Firebase initialization:

```bash
ssh root@77.42.36.198 "pm2 logs nova-video --lines 100 | grep -i firebase"
```

Expected:
- ✅ `[firebase-config] Firebase initialized` appears once
- ✅ No duplicate initialization errors
- ✅ `admin.apps.length` check prevents errors

## YouTube Token Issues

If you see `invalid_grant` errors:

1. **Regenerate token on PC:**
   ```bash
   node scripts/youtube-auth-cli.js
   ```

2. **Update server .env:**
   ```bash
   ssh root@77.42.36.198 "nano /root/NovaCiv/.env"
   # Add: YOUTUBE_REFRESH_TOKEN=new_token_here
   ```

3. **Restart worker:**
   ```bash
   ssh root@77.42.36.198 "pm2 restart nova-video"
   ```

4. **Verify:**
   ```bash
   ssh root@77.42.36.198 "pm2 logs nova-video | grep -i 'invalid_grant\|youtube'"
   ```

## Architecture Verification

### Job Processing Flow

1. **Job Creation**: `netlify/functions/create-video-job.js` creates jobs with `status: "pending"`
2. **Job Processing**: `server/video-worker.js` (PM2) processes jobs atomically
3. **Netlify Function**: `netlify/functions/video-worker.js` is **disabled** (returns early)

**Verify:**
- ✅ Jobs are created by `create-video-job.js`
- ✅ Jobs are processed ONLY by PM2 worker
- ✅ No duplicate processing (atomic transactions prevent this)

### Feature Flags Flow

1. **Storage**: Firebase `config/features/`
2. **Loading**: `server/config/feature-flags.js` (cached, 30s TTL)
3. **Usage**: Single call per loop (`getFeatureFlags()` once)

**Verify:**
- ✅ Flags are stored in Firebase (not .env)
- ✅ Flags are loaded once per job check (not twice)
- ✅ Safe defaults if Firebase read fails

## Common Issues

### Issue: "Cannot find module 'dotenv'"

**Cause**: Running from wrong directory or missing node_modules

**Fix**: 
- Ensure absolute path is used: `/root/NovaCiv/.env`
- Run `npm ci` in `/root/NovaCiv`

### Issue: Duplicate job processing

**Cause**: Two workers processing same job

**Fix**:
- Verify only PM2 worker is active
- Check atomic transaction logs
- Ensure Netlify function is disabled

### Issue: Feature flags not updating

**Cause**: Cache TTL (30 seconds) or Firebase read error

**Fix**:
- Wait 30 seconds for cache refresh
- Check Firebase connection
- Verify `config/features/` path in Firebase

### Issue: YouTube invalid_grant

**Cause**: Refresh token revoked or client mismatch

**Fix**: See "YouTube Token Issues" section above

## Quick Reference

```bash
# Deploy
bash scripts/deploy-server.sh

# View logs
ssh root@77.42.36.198 "pm2 logs nova-video"

# Restart worker
ssh root@77.42.36.198 "pm2 restart nova-video"

# Check status
ssh root@77.42.36.198 "pm2 status"

# Regenerate YouTube token (on PC)
node scripts/youtube-auth-cli.js
```


