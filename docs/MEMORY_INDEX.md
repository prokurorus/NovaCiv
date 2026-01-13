# Memory File Index — NovaCiv

**Generated:** 2026-01-13  
**Purpose:** Inventory of all project memory/context/ops/runbooks/policies files for admin-domovoy memory pack decisions

---

## 📁 docs/

### Core Canonical Files

**docs/PROJECT_CONTEXT.md**
- **Purpose:** Canonical operating context defining how the project should be managed, what "clean ops" means, allowed/forbidden operations, and human-ops-agent interaction rules. Contains operating principles, safety baselines, and memory hierarchy.
- **Sensitivity:** ADMIN-ONLY
- **Recommended:** admin-domovoy ✅

**docs/PROJECT_STATE.md**
- **Purpose:** Canonical system state snapshot describing what exists in production (VPS), what must NOT run, source of truth policies, PM2 processes, and project memory structure. Updated periodically to reflect current production state.
- **Sensitivity:** ADMIN-ONLY
- **Recommended:** admin-domovoy ✅

**docs/START_HERE.md**
- **Purpose:** Entry point document listing what's live in prod, what must NOT run, project memory locations, first checks if something breaks, and core rules. Quick reference for operators.
- **Sensitivity:** ADMIN-ONLY
- **Recommended:** admin-domovoy ✅

**docs/CURSOR_CANON.md**
- **Purpose:** Canonical instructions for Cursor AI operator role. Defines what Cursor should and should NOT do (executor, not journalist/activist/philosopher). Contains format rules, deduplication rules, and architectural prohibitions.
- **Sensitivity:** ADMIN-ONLY
- **Recommended:** admin-domovoy ✅

### Operational Documentation

**docs/OPS.md**
- **Purpose:** Operator console documentation describing Firebase monitoring, heartbeat statuses, health endpoints, smoke tests, and operational procedures. Single point of monitoring for all system components.
- **Sensitivity:** ADMIN-ONLY
- **Recommended:** admin-domovoy ✅

**docs/RUNBOOKS.md**
- **Purpose:** Operational procedures including deployment (pull-only), system snapshot generation, PM2 log access, ops-agent commands, and health monitoring procedures. Entry points and standard workflows.
- **Sensitivity:** ADMIN-ONLY
- **Recommended:** admin-domovoy ✅

**docs/REPO_MAP.md**
- **Purpose:** Repository structure map showing directory layout, where things come from, data flow, and component relationships. Helps understand project organization.
- **Sensitivity:** PUBLIC
- **Recommended:** public-domovoy (if needed) / admin-domovoy

**docs/DATA_MODEL_RTDB.md**
- **Purpose:** Firebase Realtime Database data model documentation describing top-level nodes, data structures, read/write patterns, and critical paths. No secrets, only schema.
- **Sensitivity:** ADMIN-ONLY
- **Recommended:** admin-domovoy ✅

**docs/FIREBASE_ADMIN.md**
- **Purpose:** Firebase Admin setup and utilities documentation. Describes initialization module, environment variables, smoke tests, and usage patterns for server-side Firebase access.
- **Sensitivity:** ADMIN-ONLY
- **Recommended:** admin-domovoy ✅

**docs/health-monitoring.md**
- **Purpose:** Health monitoring procedures for News and Domovoy pipelines. Describes health endpoints, response formats, monitoring setup, and alerting procedures.
- **Sensitivity:** ADMIN-ONLY
- **Recommended:** admin-domovoy ✅

### Design & Advisory

**docs/OPS_AGENT_ADVISORY_MODE_DESIGN.md**
- **Purpose:** Design document for ops-agent advisory mode (read-only planning). Defines goals, constraints, commands, data sources, and implementation details for safe operational exploration.
- **Sensitivity:** ADMIN-ONLY
- **Recommended:** admin-domovoy ✅

**docs/admin_domovoy_debug.md**
- **Purpose:** Debug and verification guide for admin-domovoy and public-domovoy functions. Contains RBAC testing procedures, frontend verification steps, and troubleshooting checklists.
- **Sensitivity:** ADMIN-ONLY
- **Recommended:** admin-domovoy ✅

### Context Bundles

**docs/CONTEXT_BUNDLE_FOR_CHATGPT.md**
- **Purpose:** Single context bundle for ChatGPT continuation work. Contains current branch, recent commits, admin implementation details, routing, Netlify Identity setup, and current state snapshot. May contain outdated information.
- **Sensitivity:** ADMIN-ONLY
- **Recommended:** neither (superseded by canonical files)

---

## 📁 runbooks/

**runbooks/README.md**
- **Purpose:** Index of runbooks with entry points. Points to SOURCE_OF_TRUTH, EMERGENCY_HOTFIX, deployment scripts, and snapshot procedures. Quick reference for available runbooks.
- **Sensitivity:** ADMIN-ONLY
- **Recommended:** admin-domovoy ✅

**runbooks/SOURCE_OF_TRUTH.md**
- **Purpose:** Hard rule for source of truth synchronization. Defines GitHub main as source of truth, pull-only VPS mode, allowed/prohibited server operations, standard workflow, dirty repository incident procedures, and protection mechanisms.
- **Sensitivity:** ADMIN-ONLY
- **Recommended:** admin-domovoy ✅

**runbooks/EMERGENCY_HOTFIX.md**
- **Purpose:** Emergency hotfix procedure without violating Source of Truth. Defines when to use, step-by-step procedure, synchronization requirements, documentation requirements, and post-hotfix analysis.
- **Sensitivity:** ADMIN-ONLY
- **Recommended:** admin-domovoy ✅

**runbooks/deploy_pull_only.sh**
- **Purpose:** Deployment script for pull-only mode. Executes git fetch, reset --hard, PM2 restart, and status check. Critical for maintaining pull-only architecture.
- **Sensitivity:** ADMIN-ONLY
- **Recommended:** neither (script, not memory)

**runbooks/snapshot_system.sh**
- **Purpose:** System snapshot generation script. Creates markdown and JSON snapshots of system state without secrets. Used for monitoring and diagnostics.
- **Sensitivity:** ADMIN-ONLY
- **Recommended:** neither (script, not memory)

---

## 📁 server/

**server/README.md**
- **Purpose:** Video worker documentation describing setup, feature flags, structure, logs, and troubleshooting. Quick start guide for video worker component.
- **Sensitivity:** ADMIN-ONLY
- **Recommended:** admin-domovoy

**server/ops-agent.js**
- **Purpose:** GitHub Ops Agent implementation (PM2: nova-ops-agent). Processes GitHub Issues with "ops" label, executes commands, generates snapshots, and manages system state. Contains operational logic.
- **Sensitivity:** ADMIN-ONLY
- **Recommended:** neither (code, not memory)

**server/video-worker.js**
- **Purpose:** Video worker implementation (PM2: nova-video). Processes video jobs from Firebase queue, handles YouTube uploads and Telegram sends based on feature flags.
- **Sensitivity:** ADMIN-ONLY
- **Recommended:** neither (code, not memory)

---

## 📁 Root Level Files

**AGENT_MEMORY_PACK.md**
- **Purpose:** Generated agent memory pack containing repository structure, system state, operational context, and runtime information. May contain outdated snapshots. Auto-generated file.
- **Sensitivity:** ADMIN-ONLY
- **Recommended:** neither (auto-generated, use canonical sources instead)

**MIGRATION_GUIDE.md**
- **Purpose:** Migration guide for architecture v2. Describes what changed, removed features, added features, and step-by-step migration procedures. Historical reference.
- **Sensitivity:** ADMIN-ONLY
- **Recommended:** admin-domovoy (for historical context)

**ARCHITECTURE_V2.md**
- **Purpose:** Architecture v2 documentation describing separation of concerns, Firebase feature flags, environment variables, and project structure. Design documentation.
- **Sensitivity:** ADMIN-ONLY
- **Recommended:** admin-domovoy

**ARCHITECTURE_AUDIT.md**
- **Purpose:** Architectural audit report identifying critical problems, anti-patterns, and proposed solutions. Historical analysis document.
- **Sensitivity:** ADMIN-ONLY
- **Recommended:** admin-domovoy (for context)

**FILE_MAP_NovaCiv.txt / FILE_MAP_NovaCiv_UPDATED.txt / FILE_MAP_NovaCiv_AUDIT_SUMMARY.md**
- **Purpose:** File mapping documents listing project files. May be outdated. Used for repository navigation.
- **Sensitivity:** PUBLIC
- **Recommended:** neither (superseded by REPO_MAP.md)

---

## 📁 scripts/ and tools/

**scripts/** (various .mjs, .sh, .js files)
- **Purpose:** Utility scripts for health checks, deployment, diagnostics, testing, and setup. Operational tools, not memory files.
- **Sensitivity:** ADMIN-ONLY
- **Recommended:** neither (scripts, not memory)

**tools/** (various .js files)
- **Purpose:** Smoke tests and audit tools for Firebase, ops, content, and database. Testing utilities, not memory files.
- **Sensitivity:** ADMIN-ONLY
- **Recommended:** neither (tools, not memory)

---

## 🎯 Summary: Top Recommendations for admin-domovoy

### Critical (Must Load)
1. **docs/PROJECT_CONTEXT.md** — Canonical operating context
2. **docs/PROJECT_STATE.md** — Canonical system state
3. **docs/START_HERE.md** — Entry point
4. **runbooks/SOURCE_OF_TRUTH.md** — Source of truth rules

### High Priority (Should Load)
5. **docs/OPS.md** — Operator console
6. **docs/RUNBOOKS.md** — Operational procedures
7. **docs/CURSOR_CANON.md** — Cursor role definition
8. **docs/DATA_MODEL_RTDB.md** — Data model
9. **runbooks/EMERGENCY_HOTFIX.md** — Emergency procedures
10. **docs/OPS_AGENT_ADVISORY_MODE_DESIGN.md** — Advisory mode design

### Medium Priority (Consider if Space Allows)
11. **docs/FIREBASE_ADMIN.md** — Firebase setup
12. **docs/health-monitoring.md** — Health monitoring
13. **docs/admin_domovoy_debug.md** — Debug guide
14. **runbooks/README.md** — Runbook index
15. **docs/REPO_MAP.md** — Repository structure

### Low Priority / Historical
16. **MIGRATION_GUIDE.md** — Historical reference
17. **ARCHITECTURE_V2.md** — Design docs
18. **ARCHITECTURE_AUDIT.md** — Historical analysis

### Do NOT Load
- **docs/CONTEXT_BUNDLE_FOR_CHATGPT.md** — Superseded by canonical files
- **AGENT_MEMORY_PACK.md** — Auto-generated, use canonical sources
- **FILE_MAP_*** files — Superseded by REPO_MAP.md
- Scripts and tools — Code, not memory

---

## 📊 Sensitivity Labels

- **PUBLIC:** Safe for public endpoints, no secrets, general project information
- **ADMIN-ONLY:** Contains operational details, procedures, system architecture, or sensitive information about production setup

---

*This index is maintained to help decide which files to load into admin-domovoy memory pack. Always prefer canonical sources (PROJECT_CONTEXT.md, PROJECT_STATE.md) over auto-generated or historical files.*
