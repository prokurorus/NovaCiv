# NovaCiv Video Pipeline - Quick Start Guide

## 🚀 Quick Setup (5 minutes)

### Step 1: Verify Environment
```bash
cd /root/NovaCiv  # or your project path

# Run diagnostic
node scripts/diagnose-and-fix-pipeline.js
```

### Step 2: Start Worker
```bash
bash scripts/setup-pm2-worker.sh
```

### Step 3: Enable YouTube Upload
In Firebase Console:
- Go to: Realtime Database → `config/features`
- Set: `youtubeUploadEnabled = true`

### Step 4: Test It
```bash
# Create test job
node create-job.js

# Monitor logs
pm2 logs nova-video
```

## 📋 Prerequisites Checklist

- [ ] `.env` file exists with required variables
- [ ] `npm install` completed
- [ ] YouTube OAuth credentials valid (test with `node scripts/test-youtube-auth.js`)
- [ ] Firebase feature flag enabled: `config/features/youtubeUploadEnabled = true`

## 🔧 Daily Operations

### Create a Job
```bash
node create-job.js
```

### Monitor Worker
```bash
pm2 logs nova-video
```

### Check Status
```bash
pm2 status nova-video
```

## 🐛 Quick Troubleshooting

**Worker not running?**
```bash
pm2 start server/video-worker.js --name nova-video --update-env
```

**YouTube upload not working?**
```bash
# Test credentials
node scripts/test-youtube-auth.js

# Check feature flag (Firebase Console)
config/features/youtubeUploadEnabled = true

# Restart worker
pm2 restart nova-video --update-env
```

**Need to regenerate YouTube token?**
```bash
node scripts/youtube-auth-cli.js
# Copy token to .env, then:
pm2 restart nova-video --update-env
```

## 📚 Full Documentation

See `PIPELINE_REPAIR_REPORT.md` for complete details.
