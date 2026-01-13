# Project State — NovaCiv

**Last verified:** 2026-01-11  
**Status:** Active

---

## A. System Overview

### What exists in production (VPS)

- **nova-ops-agent** (PM2) — GitHub Ops Agent, processes Issues with "ops" label
- **nova-video** (PM2) — Video Worker, processes video jobs from Firebase `videoJobs` queue
- **nova-admin-domovoy** (PM2) — Admin Domovoy API service, handles admin questions with full project memory (VPS-only, no split-brain)
- **Netlify scheduled functions** — fetch-news, news-cron, domovoy-auto-post, domovoy-auto-reply, video-worker

### What is explicitly NOT running in production

- **nova-news-worker** — Must NOT run on prod. News processing is handled by Netlify scheduled functions only.

---

## B. Source of Truth & Policies

**GitHub main is source of truth.** All code changes: PC → commit/push → GitHub.

**VPS is pull-only.** Server only does `git pull + pm2 restart` (via `deploy_pull_only.sh`), no manual code edits.

**"Dirty repo = incident"** — Any `git status != clean` on VPS violates pull-only mode and requires immediate remediation.

**No manual edits on VPS except .env/server configs** — Only `.env`, PM2 configs, cron, and infrastructure settings are allowed.

**Details:** [runbooks/SOURCE_OF_TRUTH.md](../runbooks/SOURCE_OF_TRUTH.md)

---

## C. Production Processes (PM2)

**Current prod processes:**
- `nova-ops-agent` — online
- `nova-video` — online
- `nova-admin-domovoy` — online (VPS-only admin brain service)

**Explicitly state:** `nova-news-worker` must NOT run on prod.

### Admin Domovoy Service

**Service:** `nova-admin-domovoy`  
**Script:** `server/admin-domovoy-api.js`  
**Port:** 3001 (default, configurable via `ADMIN_DOMOVOY_PORT`)  
**Endpoint:** `POST http://77.42.36.198:3001/admin/domovoy` (VPS IP)  
**PM2 Config:** `ecosystem.config.cjs` (includes nova-admin-domovoy entry)

**Architecture (NO SPLIT-BRAIN):**
- **Netlify = UI + RBAC gate only**
  - `/admin` page (frontend UI)
  - `/.netlify/functions/admin-proxy` (RBAC gate + proxy, NO AI)
  - `/.netlify/functions/admin-domovoy` (DISABLED, returns 410 Gone)
- **VPS = single brain only**
  - `server/admin-domovoy-api.js` (ONLY AI service)
  - Loads memory from server-only files
  - Calls OpenAI GPT-4o-mini
  - Returns answers with full project awareness
- **No duplicate logic, no ambiguity, no split-brain**

**How it works:**
1. Frontend `/admin` page calls `/.netlify/functions/admin-proxy` (Netlify proxy)
2. Proxy checks Netlify Identity admin role (RBAC gate)
3. Proxy forwards request to VPS endpoint `http://77.42.36.198:3001/admin/domovoy` with `X-Admin-Token` header (token never exposed to browser)
4. VPS service loads memory from:
   - `docs/ADMIN_ASSISTANT.md` (memory anchor)
   - `docs/PROJECT_CONTEXT.md`
   - `docs/PROJECT_STATE.md`
   - `docs/START_HERE.md` (if space allows)
   - `docs/RUNBOOKS.md` (if space allows)
   - `runbooks/SOURCE_OF_TRUTH.md` (if space allows)
   - `/root/NovaCiv/_state/system_snapshot.md` (tail 250 lines, if space allows)
5. Service calls OpenAI GPT-4o-mini with full context (max 120k chars)
6. Response includes answer + debug info (files loaded, snapshot mtime, memory bytes)

**Security:**
- Token-based auth (`X-Admin-Token` header)
- Token stored only in VPS `.env` and Netlify env (server-side)
- Token never exposed to browser (proxy handles forwarding)
- All outputs sanitized (secrets filtered)
- Netlify AI endpoint disabled (410 Gone) to prevent accidental use

**Deployment:** See `runbooks/ADMIN_DOMOVOY_VPS.md`

---

## D. Project Memory

**Repo docs:**
- `docs/PROJECT_STATE.md` — current system state (this file)
- `docs/OPS.md` — operator console, Firebase monitoring, smoke tests
- `docs/RUNBOOKS.md` — operational procedures, deployment, troubleshooting
- `docs/REPO_MAP.md` — repository structure map
- `runbooks/SOURCE_OF_TRUTH.md` — pull-only sync policy and procedures

**Server memory:**
- `/root/NovaCiv/_state/system_snapshot.md` — human-readable system snapshot (generated every 30 min)
- `/root/NovaCiv/_state/system_snapshot.json` — structured system snapshot (generated every 30 min)

---

## E. Snapshot Mechanism

**Script:** `runbooks/snapshot_system.sh`

**Cron:** Every 30 minutes (`*/30 * * * *`)

**Outputs:**
- `/root/NovaCiv/_state/system_snapshot.md`
- `/root/NovaCiv/_state/system_snapshot.json`

**Log:** `/var/log/novaciv_snapshot.log`

**"Tainted" behavior:** Snapshot checks for secret patterns (API keys, tokens, private keys). If detected, output is marked "tainted" and sanitized, script exits with error code for monitoring.

---

## F. Ops-agent Control Plane

**Trigger:** GitHub Issues with label "ops"

**Whitelist commands:**
- `snapshot` — get last system snapshot (sanitized)
- `report:status` — show PM2 status, git status, disk space
- `video:validate` — validate video pipeline config
- `youtube:refresh-test` — test YouTube token refresh
- `worker:restart` — restart PM2 worker
- `pipeline:run-test-job` — create test pipeline job

**Output sanitization guarantee:** All command outputs are sanitized before posting to GitHub Issues (secrets filtered, tokens redacted).

---

## G. Health/Diagnostics Entry Points

**When something breaks, check in this order:**

1. **Snapshot** — `cat /root/NovaCiv/_state/system_snapshot.md` (or via ops-agent: `snapshot`)
2. **Report status** — via ops-agent: `report:status` (or `pm2 status`, `git status`)
3. **PM2 logs** — `pm2 logs nova-ops-agent`, `pm2 logs nova-video`

**Additional:**
- Health endpoints: `/.netlify/functions/health-news`, `/.netlify/functions/health-domovoy`
- Firebase metrics: `/health/news/*`, `/health/domovoy/*` (heartbeat timestamps)

---

## H. Known Current Status (as of 2026-01-11)

**VPS on main** — Server repository is on `main` branch, pull-only mode active.

**PM2:**
- `nova-ops-agent` — online
- `nova-video` — online
- `nova-news-worker` — absent/not running (expected)

**Past symptom:** Earlier "dirty package-lock.json" on VPS was a violation of pull-only policy. Going forward, any dirty repo state is treated as an incident requiring immediate remediation per Source of Truth policy.

---

*Document updated to reflect audit findings and current production state.*
