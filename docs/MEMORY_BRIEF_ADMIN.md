# Memory Brief for Admin-Domovoy — Top 10 Files

**Generated:** 2026-01-13  
**Purpose:** Structured summaries of critical memory files for admin-domovoy memory pack

---

## 1. docs/PROJECT_CONTEXT.md

### Key Sections
- Purpose: Operating context definition
- Operating Principles: Source of truth, pull-only VPS, no manual edits
- Interaction Style: Short, structured, actionable responses
- Memory Hierarchy: File priority order
- Safety Baseline: Never expose secrets

### Decisions/Policies Defined
- **Source of truth = GitHub main**: All code changes via PC → commit/push → GitHub
- **VPS is pull-only**: Dirty repo on VPS = incident
- **No manual code edits on VPS**: Exception only for `.env` and server configs
- **Ops-agent must not expose secrets**: Tokens/keys never in outputs
- **Prefer runbooks over ad-hoc commands**: One big step procedures
- **Changes via PRs**: Production changes = pull + targeted restart only

### Rules Model Must Remember
1. Never print env values, tokens, keys, cookies, auth headers
2. Sanitize all outputs consistently
3. Keep responses short, structured, actionable
4. Prefer checklists and single-pass runbooks
5. If uncertain, propose read-only verification first
6. VPS dirty repo = incident requiring immediate remediation

### Constraints/Prohibitions
- ❌ No manual code edits on VPS (except `.env`/server configs)
- ❌ No secret exposure in outputs
- ❌ No ad-hoc manual commands (use runbooks)
- ❌ No production changes without PR workflow

---

## 2. docs/PROJECT_STATE.md

### Key Sections
- System Overview: What exists in production, what must NOT run
- Source of Truth & Policies: GitHub main, pull-only VPS, dirty repo = incident
- Production Processes: PM2 processes (nova-ops-agent, nova-video)
- Project Memory: Repo docs and server snapshots
- Snapshot Mechanism: Auto-generation every 30 minutes
- Ops-agent Control Plane: GitHub Issues with "ops" label, whitelist commands
- Health/Diagnostics Entry Points: First checks when something breaks
- Known Current Status: VPS state as of last verification

### Decisions/Policies Defined
- **Production processes**: nova-ops-agent (online), nova-video (online)
- **nova-news-worker must NOT run on prod**: News handled by Netlify scheduled functions only
- **Dirty repo = incident**: Violates pull-only mode, requires immediate remediation
- **Snapshot every 30 minutes**: Auto-generated, sanitized (no secrets)
- **Ops-agent commands**: Whitelist only (snapshot, report:status, worker:restart, etc.)
- **Output sanitization**: All command outputs sanitized before posting to GitHub

### Rules Model Must Remember
1. nova-news-worker must NOT run on production
2. When something breaks: (1) Get snapshot, (2) Check status, (3) Inspect PM2 logs
3. Health endpoints: `/.netlify/functions/health-news`, `/.netlify/functions/health-domovoy`
4. Firebase metrics: `/health/news/*`, `/health/domovoy/*` (heartbeat timestamps)
5. Snapshot location: `/root/NovaCiv/_state/system_snapshot.{md,json}`
6. Ops-agent trigger: GitHub Issues with label "ops"

### Constraints/Prohibitions
- ❌ nova-news-worker must NOT run on prod
- ❌ Dirty repo on VPS = incident
- ❌ No manual code edits on VPS (except `.env`/server configs)
- ❌ Ops-agent only executes whitelisted commands

---

## 3. docs/START_HERE.md

### Key Sections
- What is live (prod): PM2 processes, source of truth, VPS mode
- What must NOT run on prod: nova-news-worker
- Project memory: Canonical state, ops docs, server snapshots
- First checks if something breaks: Snapshot, status, PM2 logs
- Rules: Dirty repo = incident, no manual edits

### Decisions/Policies Defined
- **Entry point**: Quick reference for operators
- **Production state**: nova-ops-agent, nova-video (PM2)
- **Source of truth**: GitHub main
- **VPS mode**: pull-only
- **First checks**: Snapshot → status → PM2 logs

### Rules Model Must Remember
1. Always start with snapshot when investigating issues
2. Use ops-agent commands: `snapshot`, `report:status`
3. Inspect PM2 logs: `pm2 logs nova-ops-agent`, `pm2 logs nova-video`
4. Dirty repo on VPS = incident
5. No manual edits on VPS (except `.env`/server configs)

### Constraints/Prohibitions
- ❌ nova-news-worker must NOT run on prod
- ❌ Dirty repo = incident
- ❌ No manual code edits on VPS

---

## 4. runbooks/SOURCE_OF_TRUTH.md

### Key Sections
- Правило источника истины: GitHub main = source of truth
- Правила работы: Allowed/prohibited server operations
- Стандартный workflow: PC → commit/push → GitHub → Server pull
- Архитектурное правило: Dirty repo = incident
- Аварийное исключение: Emergency hotfix procedure
- Dirty Repository — инцидент: Remediation procedure
- Мониторинг: Git status checks, snapshot validation
- Защита от нарушений: Pre-commit hooks, git config

### Decisions/Policies Defined
- **Source of Truth = GitHub main**: All code changes PC → commit/push → GitHub
- **Server = runtime only**: No code edits, only execution
- **Allowed on server**: `.env`, PM2 configs, cron, infrastructure settings
- **Prohibited on server**: Code edits, git commits (except emergency), git push
- **Dirty repo = incident**: Requires immediate remediation
- **Pre-commit hook**: Blocks `git commit` on server
- **Git config**: `user.name = "SERVER-DO-NOT-COMMIT"`

### Rules Model Must Remember
1. All code changes: PC → commit/push → GitHub → Server pull
2. Server allowed: `.env`, PM2 configs, cron, infrastructure
3. Server prohibited: Code edits, git commits (except emergency)
4. Dirty repo procedure: Check changes → commit/push if needed → reset if not needed
5. Emergency hotfix: Commit/push immediately → sync PC → document in Issue
6. Pre-commit hook blocks commits on server

### Constraints/Prohibitions
- ❌ No code edits on server (except `.env`/server configs)
- ❌ No git commits on server (except emergency with --no-verify)
- ❌ No git push on server
- ❌ Dirty repo = incident requiring immediate remediation

---

## 5. docs/OPS.md

### Key Sections
- Где смотреть статусы: Firebase heartbeat, events, console
- Smoke Test: ops-smoke-test-simple.js usage
- Принудительный запуск пайплайнов: ops-run-now endpoint
- Типовые ошибки и решения: Index missing, auth errors, Telegram errors, OpenAI errors
- Интерпретация метрик: fetch-news, news-cron, domovoy-auto-post, domovoy-auto-reply
- Быстрая диагностика: 30-second check procedure
- Проверка Admin/Public Domovoy разделения: Manual verification steps

### Decisions/Policies Defined
- **Firebase heartbeat**: `/ops/heartbeat/{component}` for component status
- **Firebase events**: `/ops/events` (ring buffer, last 20 events)
- **Smoke test**: `tools/ops-smoke-test-simple.js` (requires only FIREBASE_DB_URL)
- **Ops-run-now**: `/.netlify/functions/ops-run-now?token=<OPS_CRON_SECRET>`
- **Health check order**: Smoke test → check components → check errors → check events
- **Typical errors**: Index missing, auth/token errors, Telegram errors, OpenAI errors

### Rules Model Must Remember
1. Firebase heartbeat: `/ops/heartbeat/{component}` (fetch-news, news-cron, domovoy-auto-post, domovoy-auto-reply)
2. Firebase events: `/ops/events` (last 20 events, ring buffer)
3. Smoke test: `node tools/ops-smoke-test-simple.js` (checks last 24 hours by default)
4. Ops-run-now: Forces pipeline execution (fetch-news → news-cron)
5. Index missing: Add `.indexOn: ["section"]` to Firebase rules
6. Auth errors: Check NEWS_CRON_SECRET, DOMOVOY_CRON_SECRET in Netlify Dashboard
7. Telegram errors: Check TELEGRAM_BOT_TOKEN, TELEGRAM_NEWS_CHAT_ID_* env vars
8. OpenAI errors: Check OPENAI_API_KEY, rate limits

### Constraints/Prohibitions
- ❌ Smoke test requires FIREBASE_DB_URL (no secrets needed)
- ❌ Ops-run-now requires OPS_CRON_SECRET token
- ❌ Index missing = fallback to full-scan (slower but works)

---

## 6. docs/RUNBOOKS.md

### Key Sections
- Entry Points: Snapshot, PROJECT_STATE.md, REPO_MAP.md
- Deployment: deploy_pull_only.sh script
- Snapshot: What it contains, red-flag rules, automatic update
- Troubleshooting: PM2 logs, health endpoints, common failures
- Ops-Agent Commands: Available commands via GitHub Issues
- Quick Reference: Check system state, deploy, view logs, restart services

### Decisions/Policies Defined
- **Entry point**: Always start with snapshot: `cat /root/NovaCiv/_state/system_snapshot.md`
- **Deployment**: Use `runbooks/deploy_pull_only.sh` (git fetch → reset --hard → pm2 restart)
- **Snapshot contains**: Timestamp, hostname, git state, PM2 status, disk/memory usage, cron status, health endpoints, PM2 logs (filtered)
- **Snapshot excludes**: process.env, .env files, tokens, keys, service account JSON, private keys, remote URLs with tokens
- **Red-flag rules**: Snapshot marked "tainted" if contains secret patterns (BEGIN PRIVATE KEY, AIza, sk-, ghp_, etc.)
- **Auto-update**: Every 30 minutes via cron
- **Git status dirty = incident**: Standard remediation procedure

### Rules Model Must Remember
1. Always start with snapshot when investigating: `cat /root/NovaCiv/_state/system_snapshot.md`
2. Deployment: `bash /root/NovaCiv/runbooks/deploy_pull_only.sh`
3. Snapshot location: `/root/NovaCiv/_state/system_snapshot.{md,json}`
4. Snapshot log: `/var/log/novaciv_snapshot.log`
5. Snapshot test: `bash /root/NovaCiv/scripts/test-snapshot-secrets.sh`
6. PM2 logs: `pm2 logs --lines 100`, `pm2 logs nova-ops-agent`, `pm2 logs nova-video`
7. Health checks: `node scripts/check-health-news.mjs`, `node scripts/check-health-domovoy.mjs`
8. Git status dirty procedure: Check changes → commit/push if needed → reset if not needed → update snapshot

### Constraints/Prohibitions
- ❌ Snapshot must never contain secrets (tainted = error)
- ❌ Git status dirty = incident (violates pull-only mode)
- ❌ Deployment only via deploy_pull_only.sh (no manual git operations)

---

## 7. docs/CURSOR_CANON.md

### Key Sections
- РОЛЬ CURSOR: Operator role definition (executor, not journalist/activist/philosopher)
- БАЗОВЫЕ ЗАПРЕТЫ: Architecture, format, template, HTML, dedup, style changes
- ИСТОЧНИКИ НОВОСТЕЙ: RSS sources by language (RU ≈ 25, EN ≈ 40, DE ≈ 25)
- FETCH-NEWS.JS: Canon for news collection (structure, analysis language)
- NEWS-CRON.JS: Publication algorithm (strict order: RU → EN → DE)
- ФОРМАТ TELEGRAM: Absolute canon (telegramFormat.js only)
- ОСМЫСЛЕННОСТЬ НОВОСТЕЙ: Hard requirements for fields (sense, why, view, question)
- ДЕДУП: Strictly by languages (no global dedup)
- ДОМОВОЙ: Voice, not bot (frequency, structure, prohibitions)
- OPS / ТЕСТИРОВАНИЕ: Dry-run, smoke tests
- ЕСЛИ "НЕТ НОВЫХ ТЕМ": Not an error, not a reason to change logic

### Decisions/Policies Defined
- **Cursor role**: Executor of canon, maintainer of stability, follower of rules (NOT journalist/activist/philosopher)
- **Architecture prohibitions**: No architecture changes, no Telegram format changes, no templates, no manual HTML, no global dedup
- **News sources**: 90+ RSS sources total (RU ≈ 25, EN ≈ 40, DE ≈ 25)
- **Analysis language**: Always EN (translate to EN if source not EN)
- **Topic structure**: Must have all fields (section, lang, analysisLang, title, url, sourceName, createdAt, sense, why, view, question, posted)
- **Publication order**: Strict RU → EN → DE (one topic per language, translate if not found)
- **Telegram format**: Use `telegramFormat.js` only (formatNewsMessage, formatDomovoyMessage)
- **Field requirements**: sense (240-360 chars), why (≤180), view (≤220), question (≤160)
- **Dedup**: By language only (no global dedup, one language doesn't block another)
- **Domovoy frequency**: Every 3 hours (domovoy-every-3h.js)
- **Domovoy structure**: Quote → Reflection (2-4 sentences) → Question (1 line)
- **Domovoy prohibitions**: No slogans, no "we think", no "must/should", no "good/bad" evaluation, no calls to action

### Rules Model Must Remember
1. Cursor role: Executor, not journalist/activist/philosopher
2. Architecture: No changes to architecture, format, templates, HTML, dedup logic
3. News sources: 90+ RSS sources (RU ≈ 25, EN ≈ 40, DE ≈ 25)
4. Analysis: Always on EN (translate to EN if needed)
5. Topic structure: All fields required (section, lang, analysisLang, title, url, sourceName, createdAt, sense, why, view, question, posted)
6. Publication: Strict RU → EN → DE order, one topic per language, translate if not found
7. Telegram format: Use `telegramFormat.js` only (formatNewsMessage, formatDomovoyMessage)
8. Field requirements: sense (240-360), why (≤180), view (≤220), question (≤160)
9. Dedup: By language only (no global dedup)
10. Domovoy: Every 3h, Quote → Reflection → Question, no slogans/evaluations/calls to action
11. "No new topics" = NOT an error, NOT a reason to change logic

### Constraints/Prohibitions
- ❌ No architecture changes
- ❌ No Telegram format changes
- ❌ No templates
- ❌ No manual HTML
- ❌ No global dedup (language-only)
- ❌ No "style improvements" from self
- ❌ No slogans, evaluations, calls to action in Domovoy
- ❌ "No new topics" ≠ error, ≠ reason to change logic

---

## 8. docs/DATA_MODEL_RTDB.md

### Key Sections
- RTDB Overview: Top-level nodes summary
- Основные ветки: Detailed structure for each node
- Связи между ветками: Relationships between nodes
- Резюме: Summary of main branches

### Decisions/Policies Defined
- **Top-level nodes**: config/features/, forum/topics/, forum/comments/, videoJobs/, contactRequests/, messages/, newsMeta/, health/news/, health/domovoy/, assistantMessages/, stats/
- **Critical paths**: config/features/ (feature flags), videoJobs/ (video pipeline), health/news/, health/domovoy/ (monitoring)
- **Feature flags**: youtubeUploadEnabled (default: false), telegramEnabled (default: true)
- **Forum topics**: section (news/general), lang (ru/en/de), postKind (domovoy:*, news), telegramPosted (object by language)
- **Video jobs**: status (pending/processing/done/error), targets (youtube/telegram), language, script, title, topic
- **Health metrics**: fetchNewsLastRun, newsCronLastRun, autoPostLastRun, autoReplyLastRun (with timestamps, runIds, counts, errors)

### Rules Model Must Remember
1. Critical paths: config/features/, videoJobs/, health/news/, health/domovoy/ (must be accessible)
2. Feature flags: youtubeUploadEnabled (default: false), telegramEnabled (default: true)
3. Forum topics: section (news/general), lang (ru/en/de), postKind (domovoy:*, news), telegramPosted (object by language)
4. Video jobs: status (pending/processing/done/error), targets (youtube/telegram), language, script, title, topic
5. Health metrics: fetchNewsLastRun, newsCronLastRun, autoPostLastRun, autoReplyLastRun (with timestamps, runIds, counts, errors)
6. Dedup: newsMeta/{lang}/processedKeys, newsMeta/state_{lang}.json (by language only)
7. Comments: forum/comments/{topicId}/{commentId} (domovoyReplied flag)

### Constraints/Prohibitions
- ❌ Critical paths must be accessible (violation = incident)
- ❌ Feature flags must have safe defaults (youtubeUploadEnabled: false)
- ❌ No real secrets/contacts/IDs in documentation (schema only)

---

## 9. runbooks/EMERGENCY_HOTFIX.md

### Key Sections
- Когда использовать: Critical situations only
- Процедура Emergency Hotfix: 6-step procedure
- Checklist: Verification steps
- После Emergency Hotfix: Post-analysis requirements
- Пример: Example scenario

### Decisions/Policies Defined
- **When to use**: System completely broken, cannot wait for normal workflow, immediate fix required
- **NOT for**: Normal changes, new features, refactoring
- **Procedure**: (1) Assess criticality, (2) Execute hotfix on server, (3) Immediately sync with GitHub, (4) Sync PC, (5) Document, (6) Verify system state
- **Critical step**: Must commit/push immediately (violates Source of Truth if not done)
- **Pre-commit hook bypass**: Use `git commit --no-verify` only for emergency
- **Documentation**: Create GitHub Issue with [HOTFIX] prefix, explain why normal workflow couldn't be used
- **Post-analysis**: Analyze why emergency hotfix was needed, improve monitoring/automation

### Rules Model Must Remember
1. Emergency hotfix: Only for critical situations (system completely broken, cannot wait)
2. NOT for: Normal changes, new features, refactoring
3. Procedure: Assess → Execute → Commit/push → Sync PC → Document → Verify
4. Critical step: Must commit/push immediately (use --no-verify if hook blocks)
5. Documentation: Create GitHub Issue with [HOTFIX] prefix, explain why normal workflow couldn't be used
6. Post-analysis: Analyze why needed, improve processes to prevent repetition
7. Goal: Minimize emergency hotfixes through process improvement

### Constraints/Prohibitions
- ❌ NOT for normal changes, new features, refactoring
- ❌ Must commit/push immediately (violates Source of Truth if not done)
- ❌ Must document in GitHub Issue (explain why normal workflow couldn't be used)
- ❌ Must analyze post-hotfix (improve processes to prevent repetition)

---

## 10. docs/OPS_AGENT_ADVISORY_MODE_DESIGN.md

### Key Sections
- Overview: Read-only planning mode
- Goals: Natural language input, structured output, zero execution, context-aware
- Constraints: Hard constraints (read-only, no git changes, no PM2 restarts, no file writes, no external API calls)
- New Commands: advisory:plan, advisory:explain, advisory:validate
- Data Flow: Request flow, context loading
- Execution Plan Format: Structured plan format
- Safety Guarantees: Enforcement mechanisms, validation rules
- Implementation Notes: Command handler structure, context loaders, intent parser
- Error Handling: Graceful degradation
- Future Enhancements: LLM integration, plan execution, templates, history, interactive refinement

### Decisions/Policies Defined
- **Advisory mode**: Read-only planning mode (no execution)
- **Hard constraints**: Read-only by default, no git changes, no PM2 restarts, no file writes, no external API calls
- **Data sources**: PROJECT_STATE.md (canonical memory), system snapshot (runtime context), codebase analysis (read-only)
- **Commands**: advisory:plan (generate plan from intent), advisory:explain (explain command), advisory:validate (validate plan)
- **Plan format**: Overview, prerequisites, steps, dependencies, warnings, estimated impact, rollback plan, next steps
- **Safety guarantees**: Command whitelist extension, runtime checks, file system wrapper, git command filtering, PM2 command filtering, external API filtering
- **Validation rules**: Plan validation, intent analysis, context verification

### Rules Model Must Remember
1. Advisory mode: Read-only planning (no execution)
2. Hard constraints: No git changes, no PM2 restarts, no file writes, no external API calls
3. Data sources: PROJECT_STATE.md, system snapshot, codebase analysis (read-only)
4. Commands: advisory:plan (generate plan), advisory:explain (explain command), advisory:validate (validate plan)
5. Plan format: Overview, prerequisites, steps, dependencies, warnings, estimated impact, rollback plan, next steps
6. Safety: Command whitelist, runtime checks, file system wrapper, git/PM2/API filtering
7. Validation: Plan validation, intent analysis, context verification
8. Error handling: Graceful degradation (missing context, unparseable intent, ambiguous intent)

### Constraints/Prohibitions
- ❌ Read-only by default (no execution)
- ❌ No git changes (commits, pushes, branches, repository modifications)
- ❌ No PM2 restarts (process management operations)
- ❌ No file writes (except temporary analysis files)
- ❌ No external API calls (Firebase writes, Telegram sends, etc.)
- ❌ No secret exposure in plans (only names)
- ❌ Input sanitization required
- ❌ Rate limiting required

---

## Summary: Key Rules for Admin-Domovoy

### Critical Rules (Must Remember)
1. **Source of Truth**: GitHub main = source of truth, VPS = pull-only
2. **Dirty Repo**: = incident requiring immediate remediation
3. **No Manual Edits**: On VPS (except `.env`/server configs)
4. **Secrets**: Never expose in outputs (tokens, keys, cookies, auth headers)
5. **Production Processes**: nova-ops-agent, nova-video (online); nova-news-worker (must NOT run)
6. **First Checks**: Snapshot → status → PM2 logs
7. **Deployment**: Use `deploy_pull_only.sh` (git fetch → reset --hard → pm2 restart)
8. **Emergency Hotfix**: Only for critical situations, must commit/push immediately, must document
9. **Advisory Mode**: Read-only planning (no execution, no git changes, no PM2 restarts, no file writes)
10. **Cursor Role**: Executor of canon (not journalist/activist/philosopher)

### Constraints Summary
- ❌ No manual code edits on VPS (except `.env`/server configs)
- ❌ No secret exposure in outputs
- ❌ No ad-hoc manual commands (use runbooks)
- ❌ No production changes without PR workflow
- ❌ nova-news-worker must NOT run on prod
- ❌ Dirty repo = incident
- ❌ No architecture/format/template changes (Cursor canon)
- ❌ Advisory mode: No execution, no git changes, no PM2 restarts, no file writes

---

*This brief contains structured summaries of the top 10 memory files for admin-domovoy. Always refer to original files for complete details.*
