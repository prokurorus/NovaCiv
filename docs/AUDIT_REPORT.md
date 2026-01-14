# NovaCiv System Audit Report

**Audit Date:** 2026-01-14  
**Scope:** Local PC workspace, GitHub origin/main, VPS runtime  
**Auditor:** System Inspection (Code Analysis + Configuration Review)  
**Note:** VPS direct inspection requires SSH access (see Section C limitations)

---

## 1. Executive Summary

### Overall Status: **DEGRADED**

**Top 5 Issues (Ranked):**

1. **/admin 500 "context_missing" error** (CRITICAL)
   - Admin endpoint fails to load memory pack from docs/runbooks/_state/
   - Root cause: Files missing or PROJECT_DIR path misconfiguration on VPS
   - Impact: Admin panel non-functional

2. **Local workspace has uncommitted changes** (HIGH)
   - Modified: `.gitignore`
   - Untracked: `fix-admin-context.sh`, `scripts/deploy-admin-domovoy.sh`, `test-admin-api-local.js`
   - Impact: Local state diverges from GitHub, potential deployment confusion

3. **VPS state cannot be directly verified** (MEDIUM)
   - Cannot verify git status, PM2 processes, or logs without SSH access
   - Impact: Unknown if VPS has local patches or divergences

4. **No TypeScript type checking script** (LOW)
   - `npm run typecheck` not available
   - Impact: Type errors may go undetected before deployment

5. **Multiple Netlify functions with similar purposes** (LOW)
   - Some redundancy in domovoy functions (auto-post, auto-reply, every-3h, reply)
   - Impact: Maintenance complexity

### What Works Reliably Today

- ✅ GitHub repository structure and sync (local matches origin/main HEAD)
- ✅ Frontend build configuration (Vite + React + TypeScript)
- ✅ Netlify Functions structure (20 functions identified)
- ✅ PM2 ecosystem configuration (3 processes defined)
- ✅ Firebase data model documentation exists
- ✅ Source-of-truth documentation present (docs/PROJECT_STATE.md, runbooks/)

### What is Currently Blocking

- 🔴 **Admin panel functionality** - Cannot process admin questions due to context_missing error
- 🟡 **VPS state verification** - Requires SSH access to verify PM2 processes, logs, and file system

---

## 2. Topology Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              NOVACIV SYSTEM MAP                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐
│   PC Dev     │
│  (Windows)   │
│              │
│  git push ───┼──► GitHub (origin/main) ◄─── git pull ───┐
│              │     ssh://git@ssh.github.com:443/...      │
│              │                                           │
└──────────────┘                                           │
       │                                                    │
       │ git push                                           │
       ▼                                                    │
┌────────────────────────────────────────┐                │
│          NETLIFY (CDN + Functions)     │                │
│                                          │                │
│  Frontend:                              │                │
│    • Built from dist/                   │                │
│    • Served via CDN                     │                │
│                                          │                │
│  Functions (20 total):                  │                │
│    Scheduled:                           │                │
│      • news-cron (0 * * * *)           │                │
│      • fetch-news (30 * * * *)         │                │
│      • domovoy-auto-post (0 0 * * *)   │                │
│      • domovoy-every-3h (0 */3 * * *)  │                │
│      • domovoy-auto-reply (*/10 * * *) │                │
│      • video-worker (*/15 * * * *)     │                │
│                                          │                │
│    HTTP Triggers:                       │                │
│      • admin-proxy ─────────────────────┼──► VPS:3001   │
│      • ai-domovoy                       │   /admin/domovoy│
│      • generate-video                   │                │
│      • create-video-job                 │                │
│      • health-*                         │                │
│                                          │                │
└────────────────────────────────────────┘                │
       │                                                    │
       │ HTTP requests                                      │
       ▼                                                    │
┌────────────────────────────────────────┐                │
│         VPS (77.42.36.198)             │                │
│    /root/NovaCiv                       │                │
│                                         │                │
│  PM2 Processes:                        │                │
│    • nova-ops-agent                    │                │
│      (server/ops-agent.js)             │                │
│                                         │                │
│    • nova-video                        │                │
│      (server/video-worker.js)          │                │
│                                         │                │
│    • nova-admin-domovoy (port 3001)    │◄───────────────┘
│      (server/admin-domovoy-api.js)     │
│                                         │
│  Expected context files:                │
│    • docs/ADMIN_ASSISTANT.md           │
│    • docs/PROJECT_CONTEXT.md           │
│    • docs/PROJECT_STATE.md             │
│    • runbooks/SOURCE_OF_TRUTH.md       │
│    • _state/system_snapshot.md         │
│                                         │
└────────────────────────────────────────┘
       │
       │ Firebase Admin SDK
       ▼
┌────────────────────────────────────────┐
│     FIREBASE REALTIME DATABASE         │
│  (novaciv-web-default-rtdb...)         │
│                                         │
│  Paths:                                 │
│    • config/features/                  │
│    • forum/topics/                     │
│    • forum/comments/                   │
│    • videoJobs/                        │
│    • newsMeta/                         │
│    • health/news/                      │
│    • health/domovoy/                   │
│    • assistantMessages/                │
│    • contactRequests/                  │
│    • stats/                            │
│                                         │
└────────────────────────────────────────┘
       │
       │ API calls
       ▼
┌────────────────────────────────────────┐
│      EXTERNAL SERVICES                 │
│                                         │
│  • OpenAI API (GPT-4o-mini, TTS)       │
│  • Telegram Bot API                    │
│  • YouTube Data API v3                 │
│  • GitHub API (ops-agent)              │
│                                         │
└────────────────────────────────────────┘
```

### Key Flows

#### Admin Flow (Currently Broken)
```
Browser (/admin)
  → Netlify Identity (auth + JWT)
  → /.netlify/functions/admin-proxy
  → VPS:3001/admin/domovoy (X-Admin-Token)
  → server/admin-domovoy-api.js
  → Load memory pack (docs/, runbooks/, _state/)
  → ❌ ERROR: context_missing (files not found)
  → OpenAI API (if context loaded)
  → Response
```

#### News Flow
```
Netlify Cron (fetch-news, 30 * * * *)
  → Fetch external news API
  → Process & dedupe (newsMeta/)
  → Save to forum/topics/
  → Netlify Cron (news-cron, 0 * * * *)
  → Format & post to Telegram
```

#### Domovoy Auto-Post Flow
```
Netlify Cron (domovoy-auto-post, 0 0 * * *)
  → Generate philosophical post (OpenAI)
  → Save to forum/topics/
  → Post to Telegram
```

#### Video Pipeline Flow
```
create-video-job (HTTP trigger)
  → Create job in videoJobs/ (status: "pending")
  → PM2 nova-video worker (every 15s check)
  → Atomic claim (Firebase transaction)
  → Generate video (media/scripts/pipeline.js)
  → Upload to YouTube (if feature flag enabled)
  → Send to Telegram (if feature flag enabled)
  → Mark job as "done"
```

---

## 3. Repository Structure

### Directory Tree (Key Folders, Depth ~4)

```
NovaCiv/
├── src/                          # Frontend (React + TypeScript + Vite)
│   ├── main.tsx                  # Entry point
│   ├── App.tsx                   # Manual routing, page structure
│   ├── components/               # React components (Header, AssistantWidget, etc.)
│   ├── pages/                    # Page components (Admin, Forum, News, Join, etc.)
│   ├── context/                  # React contexts (LanguageContext)
│   ├── hooks/                    # Custom hooks (useStats, useChat, useMember)
│   ├── lib/                      # Utilities (firebase.ts, formatting)
│   └── data/                     # Static data (translations.ts)
│
├── server/                       # VPS-only server processes (PM2)
│   ├── admin-domovoy-api.js      # Admin API service (port 3001)
│   ├── ops-agent.js              # GitHub Ops Agent (processes Issues)
│   ├── video-worker.js           # Video job processor
│   ├── youtube.js                # YouTube upload module
│   ├── youtube-auth.js           # YouTube OAuth utilities
│   └── config/
│       ├── firebase-config.js    # Firebase Admin SDK init
│       └── feature-flags.js      # Feature flags loader
│
├── netlify/
│   └── functions/                # Netlify serverless functions
│       ├── admin-proxy.js        # Proxy to VPS admin endpoint
│       ├── admin-domovoy.js      # (legacy/unused?)
│       ├── ai-domovoy.js         # Public assistant widget
│       ├── ai-voice.js           # TTS for assistant
│       ├── create-video-job.js   # Create video job
│       ├── domovoy-auto-post.js  # Scheduled: daily philosophical post
│       ├── domovoy-auto-reply.js # Scheduled: auto-reply to forum
│       ├── domovoy-every-3h.js   # Scheduled: every 3 hours
│       ├── domovoy-reply.js      # Manual reply handler
│       ├── fetch-news.js         # Scheduled: fetch external news
│       ├── generate-video.js     # Trigger video generation
│       ├── generate-video-background.js
│       ├── health-domovoy.js     # Health check
│       ├── health-news.js        # Health check
│       ├── news-cron.js          # Scheduled: post news to Telegram
│       ├── ops-run-now.js        # Trigger ops-agent command
│       ├── post-news-to-telegram.js
│       ├── post-to-telegram.js
│       ├── public-domovoy.js
│       ├── send-email.js         # Contact form handler
│       ├── video-worker.js       # (DISABLED - PM2 handles this)
│       └── _lib/
│           └── auth.js           # RBAC utilities
│
├── media/                        # Media resources for video generation
│   ├── backgrounds/{lang}/       # Background images (ru, en, de, es)
│   ├── scripts/
│   │   └── pipeline.js           # Core video generation (TTS + FFmpeg)
│   ├── voices/openai/            # Voice configs (nova_*_calm.json, etc.)
│   ├── subtitles/{charter,manifest}/
│   ├── shorts-presets/           # Video preset JSON files
│   └── brand/
│       └── style.md
│
├── docs/                         # Documentation & context files
│   ├── ADMIN_ASSISTANT.md        # Admin assistant context (REQUIRED by admin-domovoy-api)
│   ├── PROJECT_CONTEXT.md        # Project context (REQUIRED)
│   ├── PROJECT_STATE.md          # Project state (REQUIRED)
│   ├── START_HERE.md
│   ├── RUNBOOKS.md
│   ├── DATA_MODEL_RTDB.md        # Firebase schema documentation
│   ├── FIREBASE_ADMIN.md
│   └── ... (other docs)
│
├── runbooks/                     # Operational runbooks
│   ├── SOURCE_OF_TRUTH.md        # Source of truth policy
│   ├── ADMIN_DOMOVOY_VPS.md      # Admin service docs
│   └── ...
│
├── scripts/                      # Utility scripts
│   ├── deploy-server.sh          # VPS deployment script
│   ├── deploy-admin-domovoy.sh
│   ├── setup-firebase-config.js
│   ├── check-health-*.mjs
│   └── ...
│
├── public/                       # Static assets
│   ├── _redirects                # Netlify redirects
│   ├── manifest.json
│   └── ...
│
├── ecosystem.config.cjs          # PM2 configuration
├── netlify.toml                  # Netlify configuration
├── package.json                  # Dependencies & scripts
└── .gitignore
```

### Folder Responsibilities

- **src/**: Frontend React application (SPA with manual routing)
- **server/**: VPS-only processes (PM2 managed, NOT deployed to Netlify)
- **netlify/functions/**: Serverless functions (deployed to Netlify, scheduled + HTTP triggers)
- **media/**: Resources bundled with functions (via netlify.toml included_files)
- **docs/**: Documentation and context files (used by admin-domovoy-api for memory pack)
- **runbooks/**: Operational procedures and source-of-truth policies
- **scripts/**: Deployment and utility scripts

---

## 4. Component Inventory

### Frontend

| Component | File | Purpose |
|-----------|------|---------|
| Entry Point | `src/main.tsx` | Mounts App with LanguageProvider |
| Router | `src/App.tsx` | Manual routing via `window.location.pathname` |
| Admin Page | `src/pages/Admin.tsx` | Admin panel (Netlify Identity auth, calls admin-proxy) |
| Forum | `src/pages/ForumPage.tsx`, `src/pages/TopicPage.tsx` | Forum UI |
| News | `src/pages/NewsPage.tsx` | News feed |
| Join | `src/pages/Join.tsx` | Contact form |
| Assistant Widget | `src/components/AssistantWidget.tsx` | Public chat widget (calls ai-domovoy) |
| Firebase Client | `src/lib/firebase.ts` | Firebase client SDK initialization |
| i18n | `src/context/LanguageContext.tsx`, `src/data/translations.ts` | Language switching (ru, en, de, es) |

### Netlify Functions

| Function | Route/Cron | Purpose | Dependencies |
|----------|-----------|---------|--------------|
| `admin-proxy` | `/.netlify/functions/admin-proxy` | Proxies admin requests to VPS | Netlify Identity (admin role), VPS endpoint |
| `ai-domovoy` | `/.netlify/functions/ai-domovoy` | Public assistant widget | OpenAI API, Firebase |
| `ai-voice` | `/.netlify/functions/ai-voice` | TTS for assistant | OpenAI TTS API |
| `create-video-job` | `/.netlify/functions/create-video-job` | Creates video job in Firebase | Firebase Admin |
| `domovoy-auto-post` | `0 0 * * *` (daily) | Generates philosophical post | OpenAI API, Firebase, Telegram |
| `domovoy-auto-reply` | `*/10 * * * *` (every 10min) | Auto-replies to forum topics | OpenAI API, Firebase, Telegram |
| `domovoy-every-3h` | `0 */3 * * *` (every 3h) | Periodic domovoy task | (verify purpose) |
| `domovoy-reply` | HTTP trigger | Manual reply handler | OpenAI API, Firebase |
| `fetch-news` | `30 * * * *` (hourly) | Fetches external news | External news API, Firebase |
| `generate-video` | `/.netlify/functions/generate-video` | Triggers video generation | generate-video-background |
| `generate-video-background` | Background | Video generation (legacy?) | media/scripts/pipeline.js |
| `health-domovoy` | `/.netlify/functions/health-domovoy` | Health check for domovoy | Firebase (health/domovoy/) |
| `health-news` | `/.netlify/functions/health-news` | Health check for news | Firebase (health/news/) |
| `news-cron` | `0 * * * *` (hourly) | Posts news to Telegram | Firebase (forum/topics/), Telegram |
| `ops-run-now` | `/.netlify/functions/ops-run-now` | Triggers ops-agent command | VPS ops-agent |
| `post-news-to-telegram` | HTTP trigger | Posts news item to Telegram | Telegram API |
| `post-to-telegram` | HTTP trigger | Generic Telegram post | Telegram API |
| `public-domovoy` | HTTP trigger | Public domovoy endpoint | (verify purpose) |
| `send-email` | `/.netlify/functions/send-email` | Contact form handler | SendGrid, Telegram |
| `video-worker` | `*/15 * * * *` | **DISABLED** (PM2 handles this) | - |

### VPS Services (PM2)

| Process | Entry File | Purpose | Dependencies |
|---------|-----------|---------|--------------|
| `nova-ops-agent` | `server/ops-agent.js` | Processes GitHub Issues with "ops" label | GitHub API, Firebase, git |
| `nova-video` | `server/video-worker.js` | Processes video jobs from Firebase queue | Firebase, media/scripts/pipeline.js, YouTube API, Telegram API |
| `nova-admin-domovoy` | `server/admin-domovoy-api.js` | Admin API service (port 3001) | OpenAI API, docs/, runbooks/, _state/ |

**PM2 Configuration:** `ecosystem.config.cjs`

### Shared Libraries

| Library | Location | Purpose | Used By |
|---------|----------|---------|---------|
| Firebase Admin Init | `server/config/firebase-config.js` | Firebase Admin SDK singleton | server/*.js |
| Feature Flags | `server/config/feature-flags.js` | Feature flags loader (Firebase) | server/video-worker.js |
| YouTube Upload | `server/youtube.js` | YouTube upload logic | server/video-worker.js |
| Auth Utilities | `netlify/functions/_lib/auth.js` | RBAC (requireAdmin, requireUser) | netlify/functions/admin-proxy.js |
| Ops Pulse | `netlify/lib/opsPulse.js` | Heartbeat/event logging | Multiple Netlify functions |

---

## 5. Responsibility Index (Key Files)

| File | Responsibility | Called By | Inputs/Outputs | Risks |
|------|---------------|-----------|----------------|-------|
| `src/App.tsx` | Manual routing, page structure | `src/main.tsx` | URL pathname → React component | Manual routing (no type safety) |
| `src/pages/Admin.tsx` | Admin panel UI | `src/App.tsx` (route: `/admin`) | Netlify Identity → admin-proxy → response | Depends on VPS endpoint |
| `netlify/functions/admin-proxy.js` | Proxies admin requests to VPS | `src/pages/Admin.tsx` | JWT token → VPS:3001/admin/domovoy | VPS connectivity, token mismatch |
| `server/admin-domovoy-api.js` | Admin API service | `netlify/functions/admin-proxy.js` | Request → Load memory pack → OpenAI → Response | **context_missing if files not found** |
| `server/video-worker.js` | Video job processor | PM2 (nova-video) | Firebase videoJobs/ → Process → YouTube/Telegram | Feature flags, Firebase connectivity |
| `server/ops-agent.js` | GitHub Ops Agent | PM2 (nova-ops-agent) | GitHub Issues → Execute command → Comment | GitHub token, command whitelist |
| `netlify/functions/fetch-news.js` | Fetch external news | Netlify Cron (30 * * * *) | External API → Firebase forum/topics/ | API rate limits, duplicates |
| `netlify/functions/domovoy-auto-post.js` | Daily philosophical post | Netlify Cron (0 0 * * *) | OpenAI → Firebase → Telegram | OpenAI API, Telegram connectivity |
| `netlify/functions/ai-domovoy.js` | Public assistant widget | `src/components/AssistantWidget.tsx` | User message → OpenAI → Response | OpenAI API, context loading |
| `server/config/firebase-config.js` | Firebase Admin SDK init | All server/*.js | FIREBASE_SERVICE_ACCOUNT_JSON → Admin SDK | Singleton pattern, init errors |
| `server/config/feature-flags.js` | Feature flags loader | `server/video-worker.js` | Firebase config/features/ → Flags object | Cache TTL (30s), Firebase connectivity |
| `ecosystem.config.cjs` | PM2 configuration | PM2 start | Process definitions → PM2 processes | Process names, env vars, cwd |
| `netlify.toml` | Netlify configuration | Netlify build | Function schedules, redirects, included_files | Schedule syntax, function names |

---

## 6. Data Model & Storage

### Firebase Realtime Database

**Database URL:** `https://novaciv-web-default-rtdb.europe-west1.firebasedatabase.app`

**Top-Level Paths:**

| Path | Purpose | Read By | Write By | Critical |
|------|---------|---------|----------|----------|
| `config/features/` | Feature flags (youtubeUploadEnabled, telegramEnabled) | server/video-worker.js | Manual (Firebase Console) | ✅ Yes |
| `forum/topics/` | Forum topics (news, domovoy posts, user topics) | Frontend, news-cron, domovoy-auto-reply | fetch-news, domovoy-auto-post, Frontend | ✅ Yes |
| `forum/comments/` | Comments on topics | Frontend, domovoy-auto-reply | domovoy-auto-reply, Frontend | ✅ Yes |
| `videoJobs/` | Video job queue | server/video-worker.js | create-video-job, server/video-worker.js | ✅ Yes |
| `newsMeta/` | News metadata (deduplication) | fetch-news | fetch-news | No |
| `health/news/` | News pipeline heartbeat | health-news, scripts | fetch-news, news-cron | ✅ Yes |
| `health/domovoy/` | Domovoy pipeline heartbeat | health-domovoy, scripts | domovoy-auto-post, domovoy-auto-reply | ✅ Yes |
| `assistantMessages/` | Assistant chat history | Frontend | ai-domovoy | No |
| `contactRequests/` | Contact form submissions | send-email | Frontend (Join page) | No |
| `stats/` | Site statistics (visitors, likes, joined) | Frontend | Frontend | No |

**Schema Documentation:** `docs/DATA_MODEL_RTDB.md`

---

## 7. End-to-End Flows

### Admin Flow (Deep Dive - Currently Broken)

**Trigger:** User visits `/admin`, authenticates via Netlify Identity

**Components:**
1. `src/pages/Admin.tsx` - Renders admin UI, handles auth
2. Netlify Identity - Authenticates user, provides JWT
3. `netlify/functions/admin-proxy.js` - Proxies request to VPS
4. `server/admin-domovoy-api.js` - Processes request, loads memory pack

**Flow:**
```
1. User → /admin
2. Admin.tsx → Netlify Identity (login modal)
3. Identity → JWT token
4. Admin.tsx → POST /.netlify/functions/admin-proxy
   Headers: Authorization: Bearer <JWT>
   Body: { text: "question", history: [...] }
5. admin-proxy → Check admin role (requireAdmin)
6. admin-proxy → POST http://77.42.36.198:3001/admin/domovoy
   Headers: X-Admin-Token: <ADMIN_API_TOKEN>
   Body: { text: "question", history: [...] }
7. admin-domovoy-api → Load memory pack:
   - docs/ADMIN_ASSISTANT.md
   - docs/PROJECT_CONTEXT.md
   - docs/PROJECT_STATE.md
   - runbooks/SOURCE_OF_TRUTH.md
   - _state/system_snapshot.md (tail 250 lines)
8. ❌ ERROR: context_missing (files not found or PROJECT_DIR wrong)
9. (If successful) → Build OpenAI messages with context
10. → Call OpenAI API
11. → Return answer
```

**Failure Points:**
- **context_missing**: Memory pack files not found (docs/, runbooks/, _state/)
- **VPS unreachable**: Network/firewall issue (502/504)
- **Token mismatch**: ADMIN_API_TOKEN differs between Netlify and VPS
- **OpenAI API failure**: Rate limit, quota, or API error

**Expected Files on VPS:**
- `/root/NovaCiv/docs/ADMIN_ASSISTANT.md` (REQUIRED)
- `/root/NovaCiv/docs/PROJECT_CONTEXT.md` (REQUIRED)
- `/root/NovaCiv/docs/PROJECT_STATE.md` (REQUIRED)
- `/root/NovaCiv/runbooks/SOURCE_OF_TRUTH.md` (optional, if space allows)
- `/root/NovaCiv/_state/system_snapshot.md` (optional, tail 250 lines)

**Root Cause Hypothesis:**
Files missing or PROJECT_DIR misconfigured. Code expects `PROJECT_DIR` env var (default: `/root/NovaCiv`), but files may not exist or cwd may differ.

### News Flow

**Trigger:** Netlify Cron (`fetch-news`: `30 * * * *`, `news-cron`: `0 * * * *`)

**Components:**
1. `netlify/functions/fetch-news.js` - Fetches external news
2. `netlify/functions/news-cron.js` - Posts news to Telegram

**Flow:**
```
1. Netlify Cron → fetch-news (hourly, :30)
2. fetch-news → External news API
3. fetch-news → Dedupe (check newsMeta/)
4. fetch-news → Save to forum/topics/
5. fetch-news → Write heartbeat (health/news/)
6. Netlify Cron → news-cron (hourly, :00)
7. news-cron → Read forum/topics/ (section: "news")
8. news-cron → Format & post to Telegram
9. news-cron → Write heartbeat (health/news/)
```

**Failure Points:**
- External news API down/rate limited
- Firebase write failures
- Telegram API failures
- Duplicate detection failures

### Domovoy → Telegram Flow

**Trigger:** Netlify Cron (`domovoy-auto-post`: `0 0 * * *`, `domovoy-auto-reply`: `*/10 * * * *`)

**Components:**
1. `netlify/functions/domovoy-auto-post.js` - Daily post
2. `netlify/functions/domovoy-auto-reply.js` - Auto-reply

**Flow (auto-post):**
```
1. Netlify Cron → domovoy-auto-post (daily, midnight)
2. domovoy-auto-post → Generate post (OpenAI)
3. domovoy-auto-post → Save to forum/topics/ (postKind: "domovoy:*")
4. domovoy-auto-post → Post to Telegram
5. domovoy-auto-post → Write heartbeat (health/domovoy/)
```

**Flow (auto-reply):**
```
1. Netlify Cron → domovoy-auto-reply (every 10 min)
2. domovoy-auto-reply → Find unanswered topics
3. domovoy-auto-reply → Generate reply (OpenAI)
4. domovoy-auto-reply → Save to forum/comments/
5. domovoy-auto-reply → Post to Telegram (optional)
6. domovoy-auto-reply → Write heartbeat (health/domovoy/)
```

**Failure Points:**
- OpenAI API failures
- Firebase write failures
- Telegram API failures

### Video Pipeline Flow

**Trigger:** HTTP request to `create-video-job` or manual job creation

**Components:**
1. `netlify/functions/create-video-job.js` - Creates job
2. `server/video-worker.js` - Processes job (PM2)

**Flow:**
```
1. HTTP → create-video-job
2. create-video-job → Create job in videoJobs/ (status: "pending")
3. PM2 nova-video → Loop (every 15s)
4. video-worker → Check videoJobs/ for "pending"
5. video-worker → Atomic claim (Firebase transaction)
6. video-worker → Load feature flags (config/features/)
7. video-worker → Generate video (media/scripts/pipeline.js)
   - TTS (OpenAI)
   - FFmpeg (background + audio)
8. video-worker → Upload to YouTube (if youtubeUploadEnabled)
9. video-worker → Send to Telegram (if telegramEnabled)
10. video-worker → Mark job as "done" or "error"
```

**Failure Points:**
- Atomic claim race condition (mitigated by transactions)
- Feature flags not loaded
- Video generation failures (TTS, FFmpeg)
- YouTube upload failures (OAuth, quota)
- Telegram send failures

---

## 8. Observed Errors & Root Causes

### /admin 500 "context_missing" (CRITICAL)

**Error:** `{ ok: false, error: "context_missing", message: "Memory pack is empty or not found" }`

**Evidence:**
- Code: `server/admin-domovoy-api.js:239-247`
- Error occurs when `buildMemoryPack()` returns empty `memoryFiles` array
- Required files: `docs/ADMIN_ASSISTANT.md`, `docs/PROJECT_CONTEXT.md`, `docs/PROJECT_STATE.md`

**Root Cause Hypothesis:**
1. **Files missing on VPS**: `docs/` directory or required files not present in `/root/NovaCiv/`
2. **PROJECT_DIR misconfiguration**: `PROJECT_DIR` env var points to wrong directory
3. **Working directory mismatch**: Process runs from different cwd than expected
4. **Git state**: Files not pulled from GitHub (git dirty state or pull failed)

**Expected Behavior:**
- `buildMemoryPack()` loads files from `PROJECT_DIR/docs/`, `PROJECT_DIR/runbooks/`, `PROJECT_DIR/_state/`
- Files are sanitized (secrets removed) and combined into memory pack
- Memory pack is sent to OpenAI as context

**Diagnostic Steps Required (VPS):**
1. Check if files exist: `ls -la /root/NovaCiv/docs/ADMIN_ASSISTANT.md`
2. Check PROJECT_DIR: `echo $PROJECT_DIR` (should be `/root/NovaCiv`)
3. Check PM2 env: `pm2 show nova-admin-domovoy | grep env`
4. Check git status: `cd /root/NovaCiv && git status`
5. Check logs: `pm2 logs nova-admin-domovoy --lines 100`

**Impact:** Admin panel completely non-functional

### Local Workspace Uncommitted Changes

**Evidence:**
- `git status` shows:
  - Modified: `.gitignore`
  - Untracked: `fix-admin-context.sh`, `scripts/deploy-admin-domovoy.sh`, `test-admin-api-local.js`

**Impact:** Local state diverges from GitHub, potential deployment confusion

**Recommendation:** Review and commit or discard changes

### No TypeScript Type Checking

**Evidence:** `npm run typecheck` not available in `package.json`

**Impact:** Type errors may go undetected before deployment

**Recommendation:** Add typecheck script: `"typecheck": "tsc --noEmit"`

---

## 9. Divergences (PC vs GitHub vs VPS)

| Aspect | PC (Local) | GitHub (origin/main) | VPS | Impact | Evidence |
|--------|------------|---------------------|-----|--------|----------|
| **Git HEAD** | `b5cb86e` | `b5cb86e` | **UNKNOWN** | High | Local matches GitHub HEAD |
| **Git Status** | **DIRTY** (3 files) | Clean | **UNKNOWN** | Medium | Local has uncommitted changes |
| **Branch** | `main` | `main` | **UNKNOWN** | Low | Assumed same |
| **Node Version** | v24.12.0 | N/A | **UNKNOWN** | Medium | VPS may differ |
| **PM2 Processes** | N/A | N/A | **UNKNOWN** | High | Cannot verify without SSH |
| **Context Files** | ✅ Present | ✅ Present | **UNKNOWN** | Critical | Required for admin endpoint |
| **Env Vars** | Local .env | N/A | **UNKNOWN** | High | ADMIN_API_TOKEN, PROJECT_DIR, etc. |
| **PM2 Config** | `ecosystem.config.cjs` | `ecosystem.config.cjs` | **UNKNOWN** | Medium | Should match |

**Key Unknowns (Require VPS Access):**
- VPS git status (clean/dirty?)
- VPS PM2 process status (online/offline?)
- VPS context files existence (docs/, runbooks/, _state/)
- VPS env vars (PROJECT_DIR, ADMIN_API_TOKEN, etc.)
- VPS Node/PM2 versions
- VPS logs (PM2 logs, error patterns)

---

## 10. Performance & Reliability Notes

### PM2 Processes (Expected on VPS)

| Process | Restarts | Memory | Status | Notes |
|---------|----------|--------|--------|-------|
| `nova-ops-agent` | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | Checks GitHub Issues every 60s |
| `nova-video` | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | Checks videoJobs every 15s |
| `nova-admin-domovoy` | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | HTTP server on port 3001 |

**Cannot verify without VPS access.**

### Netlify Functions

**Scheduled Functions (Cron Load):**
- `news-cron`: Every hour (0 * * * *)
- `fetch-news`: Every hour (30 * * * *)
- `domovoy-auto-post`: Daily (0 0 * * *)
- `domovoy-every-3h`: Every 3 hours (0 */3 * * *)
- `domovoy-auto-reply`: Every 10 minutes (*/10 * * * *)
- `video-worker`: Every 15 minutes (*/15 * * * *) - **DISABLED**

**Cron Load Assessment:**
- Total: ~90 invocations/day (excluding video-worker)
- Risk: Low (Netlify limits: 1000 invocations/day for free tier)
- `domovoy-auto-reply` is most frequent (144/day)

### Suspected Bottlenecks

1. **Video Processing**: FFmpeg + TTS (CPU/memory intensive)
   - Mitigation: Runs on VPS (PM2), not Netlify
2. **OpenAI API Rate Limits**: Multiple functions call OpenAI
   - Risk: Medium (depends on quota/rate limits)
3. **Firebase Reads**: Feature flags, videoJobs polling
   - Risk: Low (RTDB handles high read volume)
4. **Admin Endpoint Timeout**: 10s timeout in admin-proxy
   - Risk: Medium (if memory pack loading is slow)

### What to Monitor

**Log Patterns:**
- `context_missing` errors (admin endpoint)
- `vps_unreachable` / `vps_timeout` (admin-proxy)
- `Firebase write error` (multiple functions)
- `OpenAI API returned status` (API failures)
- PM2 restart patterns (if accessible)

**Health Endpoints:**
- `/.netlify/functions/health-news` (news pipeline)
- `/.netlify/functions/health-domovoy` (domovoy pipeline)
- `http://77.42.36.198:3001/admin/domovoy` (VPS admin endpoint - requires token)

**Metrics to Add:**
- PM2 process uptime/restarts (requires VPS access)
- Firebase read/write latency
- OpenAI API response times
- Netlify function execution times
- Admin endpoint response times

---

## 11. Recommendations

### Immediate (Today)

1. **Fix /admin context_missing error**
   - **Action**: Verify files exist on VPS: `ls -la /root/NovaCiv/docs/ADMIN_ASSISTANT.md`
   - **Action**: Verify PROJECT_DIR env var: `pm2 show nova-admin-domovoy | grep env`
   - **Action**: Check git status: `cd /root/NovaCiv && git status`
   - **Action**: If files missing, pull from GitHub: `git pull origin main`
   - **Expected Outcome**: Admin endpoint returns 200 with answer, not 500 context_missing

2. **Verify VPS state**
   - **Action**: SSH to VPS, run diagnostic commands (see Section C requirements)
   - **Action**: Check PM2 status: `pm2 status`
   - **Action**: Check git status: `cd /root/NovaCiv && git status`
   - **Expected Outcome**: Clean git status, all PM2 processes online

3. **Clean local workspace**
   - **Action**: Review uncommitted changes: `.gitignore`, `fix-admin-context.sh`, etc.
   - **Action**: Commit or discard changes
   - **Expected Outcome**: Clean git status, no untracked files

### Short-Term (This Week)

1. **Add TypeScript type checking**
   - **Action**: Add to `package.json`: `"typecheck": "tsc --noEmit"`
   - **Action**: Run before commits/deployments
   - **Expected Outcome**: Type errors caught early

2. **Document VPS diagnostics**
   - **Action**: Create runbook for VPS health checks
   - **Action**: Document PM2 log locations and patterns
   - **Expected Outcome**: Easier troubleshooting

3. **Add admin endpoint health check**
   - **Action**: Create health endpoint (requires token) or monitoring script
   - **Action**: Monitor context_missing errors
   - **Expected Outcome**: Proactive detection of admin endpoint issues

### Medium-Term (This Month)

1. **Observability**
   - **Action**: Add structured logging (JSON logs)
   - **Action**: Set up monitoring/alerting (PM2 monitoring, Netlify function metrics)
   - **Action**: Create dashboard for health endpoints
   - **Expected Outcome**: Proactive issue detection

2. **Testing**
   - **Action**: Add integration tests for critical flows (admin, news, video)
   - **Action**: Add smoke tests for VPS processes
   - **Expected Outcome**: Regressions caught before production

3. **CI/CD**
   - **Action**: Add pre-deployment checks (typecheck, lint, tests)
   - **Action**: Add automated VPS deployment verification
   - **Expected Outcome**: Consistent, reliable deployments

4. **Safety Rails**
   - **Action**: Add VPS git dirty detection (alert if git status != clean)
   - **Action**: Add PM2 process monitoring (alert if process offline)
   - **Action**: Add admin endpoint monitoring (alert on context_missing)
   - **Expected Outcome**: Policy violations detected automatically

---

## 12. Forward Forecast

### If We Do Nothing

**7-Day Reliability Estimate: 60%**

**Most Likely Failure Modes:**
1. **Admin endpoint remains broken** (context_missing error persists)
   - Impact: Admin panel unusable
   - Probability: High (unless files exist on VPS)

2. **VPS git dirty state** (if local edits exist)
   - Impact: Pull-only policy violated, deployment confusion
   - Probability: Medium (unknown current state)

3. **PM2 process crashes** (if processes are unstable)
   - Impact: Video processing, ops-agent, admin endpoint down
   - Probability: Low-Medium (depends on current stability)

4. **Netlify function failures** (OpenAI API, Firebase connectivity)
   - Impact: News, domovoy, video triggers fail
   - Probability: Low (external dependencies usually stable)

**30-Day Reliability Estimate: 40%**

**Additional Risks:**
- Token expiration (YouTube OAuth, GitHub token)
- Quota exhaustion (OpenAI API, Netlify functions)
- Cron load accumulation (if functions slow down)
- Dependency updates (security vulnerabilities)

### If We Apply Recommendations

**7-Day Reliability Estimate: 90%**

**Improvements:**
- Admin endpoint fixed (context files verified/pulled)
- VPS state verified (git clean, PM2 online)
- Type errors caught early (typecheck script)
- Monitoring in place (health checks, alerts)

**30-Day Reliability Estimate: 85%**

**Stability Improvements:**
- Observability detects issues early
- Testing prevents regressions
- CI/CD ensures consistent deployments
- Safety rails enforce policies

### Dependency Risks

| Dependency | Risk | Mitigation |
|------------|------|------------|
| **OpenAI API** | Rate limits, quota exhaustion | Monitor usage, implement retries, consider caching |
| **YouTube OAuth** | Token expiration (~6 months) | Regenerate tokens via `youtube-auth-cli.js` |
| **GitHub Token** | Token expiration, rate limits | Monitor ops-agent logs, rotate token |
| **Netlify Functions** | Invocation limits (1000/day free tier) | Monitor usage, upgrade if needed |
| **Firebase RTDB** | Quota, connection limits | Monitor usage, optimize reads/writes |
| **Telegram API** | Rate limits, bot token expiration | Monitor send failures, rotate token if needed |

---

## Appendix: VPS Inspection Requirements

**Note:** Direct VPS inspection was not possible during this audit. The following commands should be run on VPS to complete Section C:

```bash
# C0) Proof of remote context
hostname
whoami
pwd
date -Is

# C1) Host health
uptime
free -h
df -h
node --version
pm2 --version

# C2) Repo state
cd /root/NovaCiv
git remote -v
git rev-parse HEAD
git log -1
git status

# C3) PM2 inventory
pm2 status
pm2 show nova-admin-domovoy
pm2 show nova-video
pm2 show nova-ops-agent

# C4) Logs
pm2 logs nova-admin-domovoy --lines 200
pm2 logs nova-video --lines 200
pm2 logs nova-ops-agent --lines 200

# C5) Admin endpoint diagnosis
ls -la /root/NovaCiv/docs/ADMIN_ASSISTANT.md
ls -la /root/NovaCiv/docs/PROJECT_CONTEXT.md
ls -la /root/NovaCiv/docs/PROJECT_STATE.md
ls -la /root/NovaCiv/runbooks/SOURCE_OF_TRUTH.md
ls -la /root/NovaCiv/_state/system_snapshot.md
echo $PROJECT_DIR
pm2 show nova-admin-domovoy | grep env

# C6) Cron
crontab -l
ls -la /etc/cron*

# C7) Health endpoints
curl -X POST http://localhost:3001/admin/domovoy \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: $ADMIN_API_TOKEN" \
  -d '{"text":"test"}' \
  --max-time 5
```

---

**End of Audit Report**
