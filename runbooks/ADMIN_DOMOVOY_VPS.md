# Admin Domovoy VPS — Deployment Runbook

**Service:** `nova-admin-domovoy` (PM2 process)  
**Endpoint:** `POST http://localhost:3001/admin/domovoy`  
**Purpose:** VPS-only admin brain service (no split-brain with Netlify)

---

## Prerequisites

1. **VPS has code from GitHub main** (pull-only mode)
2. **Environment variables set** in `/root/NovaCiv/.env`:
   - `ADMIN_API_TOKEN` — Secret token for API authentication
   - `OPENAI_API_KEY` — OpenAI API key for GPT-4o-mini
   - `ADMIN_DOMOVOY_PORT` — Port number (default: 3001)
   - `PROJECT_DIR` — Project directory (default: `/root/NovaCiv`)

3. **Netlify environment variables** (for proxy function):
   - `ADMIN_API_TOKEN` — Same value as VPS (server-side only, never exposed to browser)
   - `VPS_ADMIN_DOMOVOY_URL` — VPS endpoint URL (e.g., `https://novaciv.space/admin/domovoy` or `http://VPS_IP:3001/admin/domovoy`)

---

## Deployment Steps

### 1. Deploy Code (Pull-Only)

```bash
cd /root/NovaCiv
git fetch origin
git reset --hard origin/main
```

**Verify:** `git status` should show "clean"

### 2. Install Dependencies (if needed)

```bash
cd /root/NovaCiv
npm install
```

### 3. Add to PM2 Ecosystem

**Option A: Add to existing ecosystem.config.cjs**

Add this entry to your PM2 ecosystem config:

```javascript
{
  name: "nova-admin-domovoy",
  script: "server/admin-domovoy-api.js",
  cwd: "/root/NovaCiv",
  env: {
    NODE_ENV: "production",
    ENV_PATH: "/root/NovaCiv/.env",
  },
  instances: 1,
  exec_mode: "fork",
  autorestart: true,
  watch: false,
  max_memory_restart: "500M",
}
```

**Option B: Start directly with PM2**

```bash
cd /root/NovaCiv
pm2 start server/admin-domovoy-api.js \
  --name nova-admin-domovoy \
  --cwd /root/NovaCiv \
  --env production \
  --update-env
```

### 4. Start/Restart Service

```bash
# Start (if not running)
pm2 start nova-admin-domovoy --update-env

# Restart (if already running)
pm2 restart nova-admin-domovoy --update-env

# Check status
pm2 status nova-admin-domovoy
```

### 5. Verify Service

```bash
# Check logs
pm2 logs nova-admin-domovoy --lines 50

# Test endpoint locally (from VPS)
curl -X POST http://localhost:3001/admin/domovoy \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: YOUR_TOKEN_HERE" \
  -d '{"text":"test"}'
```

**Expected response:**
```json
{
  "ok": true,
  "answer": "...",
  "debug": {
    "filesLoaded": ["ADMIN_ASSISTANT.md", "PROJECT_CONTEXT.md", ...],
    "snapshotMtime": "2026-01-13T...",
    "memoryBytes": 12345
  }
}
```

---

## Health Checks

### Check PM2 Status

```bash
pm2 status nova-admin-domovoy
```

**Expected:** Status should be "online"

### Check Logs

```bash
pm2 logs nova-admin-domovoy --lines 100
```

**Look for:**
- `[admin-domovoy-api] Server listening on port 3001`
- `[admin-domovoy-api] Memory pack built: X files, Y chars`
- No errors about missing files or tokens

### Test Endpoint

```bash
# From VPS (local test)
curl -X POST http://localhost:3001/admin/domovoy \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: $ADMIN_API_TOKEN" \
  -d '{"text":"What is the project state?"}'
```

---

## Red Flags

### ❌ Service Not Running

**Symptom:** `pm2 status` shows `nova-admin-domovoy` as "stopped" or missing

**Fix:**
```bash
pm2 start nova-admin-domovoy --update-env
pm2 logs nova-admin-domovoy
```

### ❌ Missing Environment Variables

**Symptom:** Logs show "WARNING: ADMIN_API_TOKEN not set!" or "WARNING: OPENAI_API_KEY not set!"

**Fix:**
1. Check `/root/NovaCiv/.env` file
2. Add missing variables:
   ```bash
   ADMIN_API_TOKEN=your_secret_token_here
   OPENAI_API_KEY=sk-...
   ADMIN_DOMOVOY_PORT=3001
   PROJECT_DIR=/root/NovaCiv
   ```
3. Restart: `pm2 restart nova-admin-domovoy --update-env`

### ❌ Dirty Repository

**Symptom:** `git status` shows uncommitted changes

**Fix:**
```bash
cd /root/NovaCiv
git status --short
# If changes are not needed:
git reset --hard origin/main
# If changes are needed, commit and push (see SOURCE_OF_TRUTH.md)
```

### ❌ Memory Files Missing

**Symptom:** Logs show "Memory pack is empty or not found"

**Fix:**
1. Check files exist:
   ```bash
   ls -la /root/NovaCiv/docs/ADMIN_ASSISTANT.md
   ls -la /root/NovaCiv/docs/PROJECT_CONTEXT.md
   ls -la /root/NovaCiv/docs/PROJECT_STATE.md
   ```
2. If missing, pull from GitHub:
   ```bash
   cd /root/NovaCiv
   git fetch origin
   git reset --hard origin/main
   ```

### ❌ Port Already in Use

**Symptom:** Error "EADDRINUSE: address already in use :::3001"

**Fix:**
1. Find process using port:
   ```bash
   lsof -i :3001
   ```
2. Kill process or change port in `.env`:
   ```bash
   ADMIN_DOMOVOY_PORT=3002
   ```
3. Restart: `pm2 restart nova-admin-domovoy --update-env`

---

## Networking Setup

### Option 1: Nginx Reverse Proxy (Recommended)

Add to nginx config (e.g., `/etc/nginx/sites-available/novaciv`):

```nginx
location /admin/domovoy {
    proxy_pass http://127.0.0.1:3001/admin/domovoy;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Then set in Netlify env: `VPS_ADMIN_DOMOVOY_URL=https://novaciv.space/admin/domovoy`

### Option 2: Direct IP Access

Set in Netlify env: `VPS_ADMIN_DOMOVOY_URL=http://VPS_IP:3001/admin/domovoy`

**Note:** Requires firewall rules to allow port 3001 from Netlify IPs.

---

## Monitoring

### PM2 Monitoring

```bash
# Real-time logs
pm2 logs nova-admin-domovoy

# Status
pm2 status

# Memory/CPU usage
pm2 monit
```

### System Snapshot

The service is included in system snapshots (every 30 min):
- Check: `cat /root/NovaCiv/_state/system_snapshot.md`
- Look for PM2 status section

---

## Rollback

If something goes wrong:

```bash
# Stop service
pm2 stop nova-admin-domovoy

# Remove from PM2
pm2 delete nova-admin-domovoy

# Revert code (if needed)
cd /root/NovaCiv
git reset --hard origin/main
```

---

## Security Notes

- **ADMIN_API_TOKEN** must be strong and unique
- **Never commit** `.env` file to git
- **Never expose** ADMIN_API_TOKEN to browser (proxy handles this)
- **Sanitize logs** — service automatically filters secrets from outputs

---

*Last updated: 2026-01-13*
