# Agent Memory Pack — NovaCiv/Domovoy
**Generated:** 2026-01-13  
**SSH Session Verified:** ✅ Connected to root@77.42.36.198 (ubuntu-4gb-hel1-1)

---

## PART A — Repository (Local/Cursor Workspace)

### 1. Project Structure

#### Key Directories

**docs/** (15 files):
- `PROJECT_CONTEXT.md` - Canonical operating context
- `PROJECT_STATE.md` - Canonical system state
- `OPS.md` - Operator console, Firebase monitoring
- `RUNBOOKS.md` - Operational procedures
- `REPO_MAP.md` - Repository structure map
- `START_HERE.md` - Entry point
- `CURSOR_CANON.md` - Cursor-specific guidelines
- `DATA_MODEL_RTDB.md` - Firebase data model
- `FIREBASE_ADMIN.md` - Firebase admin setup
- `health-monitoring.md` - Health monitoring procedures
- `OPS_AGENT_ADVISORY_MODE_DESIGN.md` - Ops agent design
- `admin_domovoy_debug.md` - Domovoy debugging guide

**server/** (9 files):
- `ops-agent.js` - GitHub Ops Agent (PM2: nova-ops-agent)
- `video-worker.js` - Video Worker (PM2: nova-video)
- `nova-news-worker.js` - **NOT RUNNING** (must not run on prod)
- `youtube.js` - YouTube upload module
- `youtube-auth.js` - YouTube OAuth
- `config/feature-flags.js` - Feature flags (Firebase)
- `config/firebase-config.js` - Firebase initialization
- `lib/firebaseAdmin.js` - Firebase admin utilities
- `lib/opsPulse.js` - Ops pulse utilities

**netlify/functions/** (21 JS files, 18 ZIP files):
- `admin-domovoy.js` - Admin Domovoy endpoint (RBAC)
- `public-domovoy.js` - Public Domovoy endpoint
- `ai-domovoy.js` - AI Domovoy function
- `domovoy-auto-post.js` - Auto-post scheduled function
- `domovoy-auto-reply.js` - Auto-reply scheduled function
- `domovoy-every-3h.js` - Every 3h scheduled function
- `health-news.js` - News health endpoint
- `health-domovoy.js` - Domovoy health endpoint
- `fetch-news.js` - Fetch news scheduled function
- `news-cron.js` - News cron scheduled function
- `video-worker.js` - **DISABLED** (returns early, PM2 handles jobs)
- `create-video-job.js` - Create video job endpoint
- `ops-run-now.js` - Ops run-now endpoint

**scripts/** (18 files):
- `deploy-server.sh` - Deploy to server (SSH: root@77.42.36.198)
- `deploy-video-worker.sh` - Deploy video worker
- `setup-ops-agent.sh` - Setup ops-agent
- `setup-pm2-worker.sh` - Setup PM2 worker
- `setup-firebase-config.js` - Firebase config setup
- `check-health-domovoy.mjs` - Health check Domovoy
- `check-health-news.mjs` - Health check News
- `test-end-to-end.js` - End-to-end tests
- `youtube-auth-cli.js` - YouTube auth CLI

**tools/** (7 files):
- `ops-smoke-test.js` - Ops smoke test
- `firebase-smoke-test.js` - Firebase smoke test
- `db-audit.js` - Database audit
- `content-smoke-test.js` - Content smoke test

**runbooks/** (5 files):
- `SOURCE_OF_TRUTH.md` - Pull-only sync policy
- `deploy_pull_only.sh` - Pull-only deployment script
- `snapshot_system.sh` - System snapshot generator
- `EMERGENCY_HOTFIX.md` - Emergency hotfix procedures
- `README.md` - Runbooks index

**Note:** `_state/` directory does NOT exist in local repo (server-only)

---

### 2. Canonical Documentation

#### docs/PROJECT_CONTEXT.md (FULL CONTENTS)

```
# PROJECT_CONTEXT — NovaCiv (Canonical)

## Purpose
This file captures the stable, long-term operating context for NovaCiv:
- how the project should be managed
- what "clean ops" means
- what is allowed / forbidden in production
- how humans and ops-agent interact

This file is canonical and must be kept consistent with docs/PROJECT_STATE.md.

## Operating Principles
- Source of truth is GitHub `main`.
- VPS is pull-only. A dirty repo on VPS is an incident.
- No manual code edits on VPS (exception: `.env` and server configs only).
- Ops-agent must not expose secrets (tokens/keys) in outputs.
- Prefer "one big step" runbooks over ad-hoc manual commands.
- Changes happen via PRs; production changes are deployed by pull + targeted restart only.

## Interaction Style
- Keep responses short, structured, and actionable.
- Prefer checklists and single-pass runbooks.
- If uncertain, propose a read-only verification first.

## Memory Hierarchy
1) docs/START_HERE.md (entry point)
2) docs/PROJECT_STATE.md (canonical system state)
3) docs/PROJECT_CONTEXT.md (this file: canonical operating context)
4) /root/NovaCiv/_state/system_snapshot.{md,json} (runtime snapshots; non-canonical)

## Safety Baseline
- Never print env values.
- Never print tokens, keys, cookies, auth headers.
- Sanitize outputs consistently.
```

#### docs/PROJECT_STATE.md (FULL CONTENTS)

**Last verified:** 2026-01-11  
**Status:** Active

**Key Points:**
- **nova-ops-agent** (PM2) — GitHub Ops Agent, processes Issues with "ops" label
- **nova-video** (PM2) — Video Worker, processes video jobs from Firebase `videoJobs` queue
- **Netlify scheduled functions** — fetch-news, news-cron, domovoy-auto-post, domovoy-auto-reply, video-worker
- **nova-news-worker** — Must NOT run on prod. News processing is handled by Netlify scheduled functions only.

**Source of Truth & Policies:**
- GitHub main is source of truth
- VPS is pull-only (server only does `git pull + pm2 restart`)
- "Dirty repo = incident"
- No manual edits on VPS except .env/server configs

**Snapshot Mechanism:**
- Script: `runbooks/snapshot_system.sh`
- Cron: Every 30 minutes (`*/30 * * * *`)
- Outputs: `/root/NovaCiv/_state/system_snapshot.{md,json}`
- Log: `/var/log/novaciv_snapshot.log`

**Ops-agent Control Plane:**
- Trigger: GitHub Issues with label "ops"
- Commands: `snapshot`, `report:status`, `video:validate`, `youtube:refresh-test`, `worker:restart`, `pipeline:run-test-job`

---

### 3. Search Results: Domovoy/Ops-Agent/Snapshot/Runbook References

**Top Matching Files (72 files found):**

**Server:**
- `server/ops-agent.js` - Main ops-agent implementation
  - Commands: `snapshot`, `snapshot:get`, `snapshot:run`, `report:status`
  - Handlers: `handleSnapshot`, `handleSnapshotRun`, `handleReportStatus`
  - Loads `PROJECT_STATE.md` and `PROJECT_CONTEXT.md` from `docs/`
  - Checks snapshot files in `_state/` directory

**Netlify Functions:**
- `netlify/functions/admin-domovoy.js` - Admin Domovoy endpoint
  - Loads `PROJECT_STATE.md` and `PROJECT_CONTEXT.md`
  - Uses OpenAI based on PROJECT_CONTEXT.md
- `netlify/functions/public-domovoy.js` - Public Domovoy endpoint
- `netlify/functions/domovoy-auto-post.js` - Auto-post scheduled function
- `netlify/functions/domovoy-auto-reply.js` - Auto-reply scheduled function
- `netlify/functions/domovoy-every-3h.js` - Every 3h scheduled function

**Runbooks:**
- `runbooks/snapshot_system.sh` - System snapshot generator (sanitized, no secrets)
- `runbooks/deploy_pull_only.sh` - Pull-only deployment script
- `runbooks/SOURCE_OF_TRUTH.md` - Pull-only sync policy

**Documentation:**
- `docs/RUNBOOKS.md` - Operational procedures
- `docs/PROJECT_STATE.md` - System state
- `docs/PROJECT_CONTEXT.md` - Operating context
- `docs/OPS.md` - Operator console
- `docs/admin_domovoy_debug.md` - Domovoy debugging

---

## PART B — Server (Remote SSH)

### SSH Session Proof

**Connection:** root@77.42.36.198  
**Hostname:** ubuntu-4gb-hel1-1  
**Current Directory:** /root  
**User:** root  
**Node.js:** v20.19.6  
**PM2:** 6.0.14

**PM2 Processes:**
- `nova-ops-agent` (id: 0) - online, uptime: 7h, restarts: 3
- `nova-video` (id: 7) - online, uptime: 2D, restarts: 0

**Note:** No Domovoy PM2 processes (Domovoy runs as Netlify scheduled functions)

---

### 4. State Snapshots

**Snapshot Directory:** `/root/NovaCiv/_state/`

**Files:**
- `system_snapshot.md` (15K) - Last modified: 2026-01-13 20:00:01 UTC
- `system_snapshot.json` (17K) - Last modified: 2026-01-13 20:00:01 UTC

**Secret Check:** ✅ No secrets detected (grep for red-flag patterns returned empty)

**Snapshot Contents (First 120 lines of .md):**
```
# NovaCiv System Snapshot

**Generated:** 2026-01-13 20:00:01 UTC  
**Timestamp:** 2026-01-13T20:00:01+00:00

## System
- **Hostname:** ubuntu-4gb-hel1-1
- **Uptime since:** 2026-01-02 17:25:21

## Repo Path
- **Path:** /root/NovaCiv
- **Status:** valid

## Versions
- **Node.js:** v20.19.6
- **PM2:** 6.0.14

## Resources
### Disk Usage
/dev/sda1        38G  8.7G   28G  25% /

### Memory Usage
               total        used        free      shared  buff/cache   available
Mem:           3.7Gi       340Mi       2.4Gi       5.0Mi       1.0Gi       3.1Gi

## PM2 Status
┌────┬───────────────────┬─────────────┬─────────┬─────────┬──────────┬────────┬──────┬───────────┬──────────┬──────────┬──────────┬──────────┐
│ id │ name              │ namespace   │ version │ mode    │ pid      │ uptime │ ↺    │ status    │ cpu      │ mem      │ user     │ watching │
├────┼───────────────────┼─────────────┼─────────┼─────────┼──────────┼────────┼──────┼───────────┼──────────┼──────────┼──────────┼──────────┤
│ 0  │ nova-ops-agent    │ default     │ 1.0.0   │ fork    │ 411647   │ 7h     │ 3    │ online    │ 0%       │ 71.7mb   │ root     │ disabled │
│ 7  │ nova-video        │ default     │ 1.0.0   │ fork    │ 286793   │ 2D     │ 0    │ online    │ 0%       │ 138.7mb  │ root     │ disabled │
└────┴───────────────────┴─────────────┴─────────┴─────────┴──────────┴────────┴──────┴───────────┴──────────┴──────────┴──────────┴──────────┘

## Git Status
- **Branch:** main
- **Commit:** 0d28d90 (0d28d902624be253043ca3038a2c10b060ba7738)
- **Status:** dirty ⚠️ RED FLAG: Violation of pull-only mode
- **Remote:** configured
- **Ahead of origin/main:** 0 commits
- **Behind origin/main:** 0 commits

## Health Endpoints
- **Configured:** health-news health-domovoy

## PM2 Logs: nova-ops-agent
[Last 80 lines of ops-agent logs - polling GitHub Issues with "ops" label every minute]

## PM2 Logs: nova-video
[Last 80 lines of video-worker logs - checking for pending jobs, feature flags loaded]
```

**Red Flag Detected:** ⚠️ Git status is **dirty** (violation of pull-only mode)

---

### 5. PM2 Logs

#### nova-ops-agent (Last 200 lines)
- **Status:** Online, running, polling GitHub Issues
- **Pattern:** `[ops-agent] Found 4 open issues with label "ops"` (every minute)
- **Health:** ✅ Normal operation

#### nova-video (Last 200 lines)
- **Status:** Online, running, checking for pending jobs
- **Pattern:** `[worker] checking for pending jobs...` → `[worker] no pending jobs`
- **Feature Flags:** `{ youtubeUploadEnabled: true, telegramEnabled: true }`
- **Health:** ✅ Normal operation (no pending jobs)

#### domovoy* (PM2 processes)
- **Result:** No PM2 processes matching "domovoy*"
- **Note:** Domovoy runs as Netlify scheduled functions, not PM2 processes

---

### 6. Cron Jobs

**User crontab (root):**
```
*/30 * * * * /root/NovaCiv/runbooks/snapshot_system.sh >> /var/log/novaciv_snapshot.log 2>&1
```

**System cron directories:**
- `/etc/cron.d/` - Contains standard system cron jobs (no NovaCiv-specific)
- `/etc/cron.daily/` - Standard daily cron jobs
- `/etc/cron.hourly/` - Empty

**NovaCiv-related cron jobs:** Only the snapshot script (every 30 minutes)

---

## PART C — Agent Memory Pack Summary

### Source of Truth Documentation

**Location:** `docs/` directory in repository

**Canonical Files:**
1. `docs/PROJECT_STATE.md` - Current system state (canonical)
2. `docs/PROJECT_CONTEXT.md` - Operating context (canonical)
3. `docs/START_HERE.md` - Entry point
4. `docs/RUNBOOKS.md` - Operational procedures
5. `docs/OPS.md` - Operator console

**Runtime Snapshots (Non-Canonical):**
- `/root/NovaCiv/_state/system_snapshot.md` - Human-readable snapshot
- `/root/NovaCiv/_state/system_snapshot.json` - Structured snapshot
- Generated every 30 minutes by `runbooks/snapshot_system.sh`

---

### Deployment/Sync Mechanism

**Source of Truth:** GitHub `main` branch

**Server Sync:** Pull-only mode
- Script: `runbooks/deploy_pull_only.sh`
- Process:
  1. `git fetch origin`
  2. `git reset --hard origin/main`
  3. `pm2 restart all`
  4. `pm2 status`
- **Policy:** No manual code edits on VPS (exception: `.env` and server configs only)
- **Red Flag:** Any `git status != clean` on VPS is an incident

**Deployment from PC:**
- Script: `scripts/deploy-server.sh`
- SSH: `root@77.42.36.198`
- Path: `/root/NovaCiv`

---

### Automations & Health

#### PM2 Processes (VPS)

1. **nova-ops-agent** (ID: 0)
   - **Status:** ✅ Online (uptime: 7h, restarts: 3)
   - **Function:** GitHub Ops Agent, processes Issues with "ops" label
   - **Commands:** `snapshot`, `report:status`, `worker:restart`, etc.
   - **Logs:** Polling GitHub every minute, found 4 open issues with "ops" label

2. **nova-video** (ID: 7)
   - **Status:** ✅ Online (uptime: 2D, restarts: 0)
   - **Function:** Video Worker, processes video jobs from Firebase `videoJobs` queue
   - **Feature Flags:** `youtubeUploadEnabled: true`, `telegramEnabled: true`
   - **Logs:** Checking for pending jobs, no pending jobs currently

**Explicitly NOT Running:**
- `nova-news-worker` - Must NOT run on prod (handled by Netlify functions)

#### Netlify Scheduled Functions

- `fetch-news` - Fetch news scheduled function
- `news-cron` - News cron scheduled function
- `domovoy-auto-post` - Auto-post scheduled function
- `domovoy-auto-reply` - Auto-reply scheduled function
- `domovoy-every-3h` - Every 3h scheduled function
- `video-worker` - **DISABLED** (returns early, PM2 handles jobs)

#### Cron Jobs

- **Snapshot:** Every 30 minutes (`*/30 * * * *`)
  - Script: `/root/NovaCiv/runbooks/snapshot_system.sh`
  - Log: `/var/log/novaciv_snapshot.log`
  - Outputs: `/root/NovaCiv/_state/system_snapshot.{md,json}`

---

### Key Runbooks & Scripts

**Runbooks (runbooks/):**
- `runbooks/SOURCE_OF_TRUTH.md` - Pull-only sync policy
- `runbooks/deploy_pull_only.sh` - Pull-only deployment script
- `runbooks/snapshot_system.sh` - System snapshot generator
- `runbooks/EMERGENCY_HOTFIX.md` - Emergency hotfix procedures
- `runbooks/README.md` - Runbooks index

**Deployment Scripts (scripts/):**
- `scripts/deploy-server.sh` - Deploy to server (SSH)
- `scripts/deploy-video-worker.sh` - Deploy video worker
- `scripts/setup-ops-agent.sh` - Setup ops-agent
- `scripts/setup-pm2-worker.sh` - Setup PM2 worker

**Snapshot Script:**
- **Path:** `/root/NovaCiv/runbooks/snapshot_system.sh`
- **Frequency:** Every 30 minutes (cron)
- **Outputs:** `/root/NovaCiv/_state/system_snapshot.{md,json}`
- **Security:** Hardened, no secrets, red-flag scanner active

---

### Red Flags Detected

1. **⚠️ Git Status: DIRTY**
   - **Location:** `/root/NovaCiv`
   - **Status:** `git status != clean`
   - **Impact:** Violation of pull-only mode policy
   - **Action Required:** Investigate and resolve per `runbooks/SOURCE_OF_TRUTH.md`
   - **Details:** Commit `0d28d90`, branch `main`, no commits ahead/behind origin/main

**No Secrets Detected:** ✅ Snapshot files are clean (grep for red-flag patterns returned empty)

---

### Quick Reference Links

**Server Paths:**
- Repository: `/root/NovaCiv`
- Snapshots: `/root/NovaCiv/_state/`
- Snapshot Script: `/root/NovaCiv/runbooks/snapshot_system.sh`
- Deploy Script: `/root/NovaCiv/runbooks/deploy_pull_only.sh`
- Snapshot Log: `/var/log/novaciv_snapshot.log`

**Documentation Paths (Repo):**
- `docs/PROJECT_STATE.md` - System state
- `docs/PROJECT_CONTEXT.md` - Operating context
- `runbooks/SOURCE_OF_TRUTH.md` - Pull-only policy
- `runbooks/README.md` - Runbooks index

**PM2 Commands:**
- Status: `pm2 status`
- Logs: `pm2 logs nova-ops-agent --lines 200 --nostream`
- Logs: `pm2 logs nova-video --lines 200 --nostream`
- Restart: `pm2 restart all`

**Git Commands:**
- Status: `git status` (should be clean)
- Deploy: `bash /root/NovaCiv/runbooks/deploy_pull_only.sh`

---

**Generated:** 2026-01-13  
**SSH Verified:** ✅ root@77.42.36.198 (ubuntu-4gb-hel1-1)  
**No Secrets Exposed:** ✅ All outputs sanitized
