# Netlify → VPS Environment Variable Migration Plan

## Overview

This document outlines the gradual migration of environment variables from Netlify to VPS to avoid AWS Lambda's strict ~4KB limit for all environment variables combined.

**CRITICAL POLICY**: No environment variables are automatically deleted from Netlify. Each variable is removed ONLY AFTER:
1. It is fully migrated to VPS (.env + pm2/ecosystem)
2. Code no longer depends on it in Netlify Functions
3. User (Ruslan) explicitly confirms removal

---

## Current Status: Phase 1 Complete ✅

**Netlify Functions Directory**: `netlify/functions-lite` (lightweight, minimal env vars)

**Active Netlify Functions**:
- `admin-proxy` - Uses ONLY: `ADMIN_DOMOVOY_API_URL`, `ADMIN_API_TOKEN`

**All Heavy Functions**: Moved to VPS-only (see `server/` directory)

---

## Environment Variable Classification

### ✅ Netlify-Safe (Required for Netlify Functions)

These variables are actively used by Netlify Functions and **MUST remain** in Netlify:

| Variable | Used By | Purpose |
|----------|---------|---------|
| `ADMIN_DOMOVOY_API_URL` | `admin-proxy` | VPS endpoint URL for admin API |
| `ADMIN_API_TOKEN` | `admin-proxy` | Token for VPS authentication |

**Total Netlify footprint**: ~100 bytes (well under 4KB limit)

---

### ❌ VPS-Only (Can be removed from Netlify after migration)

These variables are **NOT used by any Netlify Function** and can be safely removed from Netlify once migrated to VPS.

#### Firebase Variables (Largest footprint - prioritize removal)

| Variable | Size Estimate | Used By (VPS) | Migration Priority |
|----------|---------------|---------------|-------------------|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | **~2-3KB** ⚠️ | `video-worker`, `create-video-job` | **HIGHEST** - Largest single var |
| `FIREBASE_DATABASE_URL` | ~100 bytes | Various VPS workers | High |
| `FIREBASE_DB_URL` | ~100 bytes | Various VPS workers | High |

**Action**: These are already VPS-only. Can be removed from Netlify immediately after VPS verification.

#### OpenAI Variables

| Variable | Size Estimate | Used By (VPS) | Migration Priority |
|----------|---------------|---------------|-------------------|
| `OPENAI_API_KEY` | ~100 bytes | All AI functions on VPS | Medium |
| `OPENAI_MODEL` | ~50 bytes | AI functions | Low |
| `OPENAI_TTS_MODEL` | ~50 bytes | AI voice functions | Low |
| `OPENAI_TTS_VOICE` | ~20 bytes | AI voice functions | Low |

**Action**: Already VPS-only. Can be removed from Netlify after VPS verification.

#### Telegram Variables

| Variable | Size Estimate | Used By (VPS) | Migration Priority |
|----------|---------------|---------------|-------------------|
| `TELEGRAM_BOT_TOKEN` | ~100 bytes | Telegram posting functions | Medium |
| `TELEGRAM_CHAT_ID` | ~50 bytes | Telegram posting | Low |
| `TELEGRAM_NEWS_CHAT_ID` | ~50 bytes | News posting | Low |
| `TELEGRAM_NEWS_CHAT_ID_RU` | ~50 bytes | Russian news channel | Low |
| `TELEGRAM_NEWS_CHAT_ID_DE` | ~50 bytes | German news channel | Low |

**Action**: Already VPS-only. Can be removed from Netlify after VPS verification.

#### YouTube Variables

| Variable | Size Estimate | Used By (VPS) | Migration Priority |
|----------|---------------|---------------|-------------------|
| `YOUTUBE_CLIENT_ID` | ~100 bytes | Video upload worker | Medium |
| `YOUTUBE_CLIENT_SECRET` | ~100 bytes | Video upload worker | Medium |
| `YOUTUBE_REFRESH_TOKEN` | ~200 bytes | Video upload worker | Medium |
| `YOUTUBE_UPLOAD_ENABLED` | ~20 bytes | Video upload worker | Low |

**Action**: Already VPS-only. Can be removed from Netlify after VPS verification.

#### Cron Secret Variables

| Variable | Size Estimate | Used By (VPS) | Migration Priority |
|----------|---------------|---------------|-------------------|
| `DOMOVOY_CRON_SECRET` | ~50 bytes | Domovoy cron jobs | Low |
| `DOMOVOY_REPLY_CRON_SECRET` | ~50 bytes | Domovoy reply cron | Low |
| `NEWS_CRON_SECRET` | ~50 bytes | News cron jobs | Low |
| `OPS_CRON_SECRET` | ~50 bytes | Ops cron jobs | Low |

**Action**: Already VPS-only. Can be removed from Netlify after VPS verification.

#### Other Variables

| Variable | Size Estimate | Used By (VPS) | Migration Priority |
|----------|---------------|---------------|-------------------|
| `SENDGRID_API_KEY` | ~100 bytes | Email sending | Low |
| `DOMOVOY_API_URL` | ~100 bytes | (Legacy, may be unused) | Low |

**Action**: Already VPS-only. Can be removed from Netlify after VPS verification.

---

## Migration Order (Recommended)

### Step 1: Remove Largest Variable First ⚠️

**`FIREBASE_SERVICE_ACCOUNT_JSON`** (~2-3KB)
- **Status**: Already VPS-only (no Netlify function uses it)
- **Action**: Remove from Netlify UI immediately
- **Verification**: Ensure VPS workers can access Firebase

### Step 2: Remove Firebase URL Variables

**`FIREBASE_DATABASE_URL`** and **`FIREBASE_DB_URL`**
- **Status**: Already VPS-only
- **Action**: Remove from Netlify after Step 1 verification
- **Verification**: Ensure VPS workers can connect to Firebase

### Step 3: Remove OpenAI Variables

**`OPENAI_API_KEY`**, **`OPENAI_MODEL`**, **`OPENAI_TTS_MODEL`**, **`OPENAI_TTS_VOICE`**
- **Status**: Already VPS-only
- **Action**: Remove from Netlify after Step 2 verification
- **Verification**: Ensure VPS AI functions work correctly

### Step 4: Remove Telegram Variables

**`TELEGRAM_BOT_TOKEN`** and all **`TELEGRAM_*_CHAT_ID`** variables
- **Status**: Already VPS-only
- **Action**: Remove from Netlify after Step 3 verification
- **Verification**: Ensure VPS can post to Telegram

### Step 5: Remove YouTube Variables

**`YOUTUBE_CLIENT_ID`**, **`YOUTUBE_CLIENT_SECRET`**, **`YOUTUBE_REFRESH_TOKEN`**, **`YOUTUBE_UPLOAD_ENABLED`**
- **Status**: Already VPS-only
- **Action**: Remove from Netlify after Step 4 verification
- **Verification**: Ensure VPS video upload works

### Step 6: Remove Cron Secrets

**`DOMOVOY_CRON_SECRET`**, **`DOMOVOY_REPLY_CRON_SECRET`**, **`NEWS_CRON_SECRET`**, **`OPS_CRON_SECRET`**
- **Status**: Already VPS-only
- **Action**: Remove from Netlify after Step 5 verification
- **Verification**: Ensure VPS cron jobs are protected

### Step 7: Remove Remaining Variables

**`SENDGRID_API_KEY`**, **`DOMOVOY_API_URL`** (if unused)
- **Status**: Already VPS-only
- **Action**: Remove from Netlify after Step 6 verification

---

## Verification Checklist

Before removing each variable from Netlify:

- [ ] Variable is present in VPS `.env` file
- [ ] Variable is configured in VPS `ecosystem.config.cjs` (if needed)
- [ ] All VPS workers that use the variable are running
- [ ] No Netlify Functions reference the variable (check `netlify/functions-lite/`)
- [ ] Test the VPS functionality that uses the variable
- [ ] User (Ruslan) confirms removal

---

## Post-Migration State

**Netlify Environment Variables** (Final):
- `ADMIN_DOMOVOY_API_URL` (~100 bytes)
- `ADMIN_API_TOKEN` (~100 bytes)

**Total**: ~200 bytes (well under 4KB limit)

**VPS Environment Variables** (All heavy secrets):
- All Firebase variables
- All OpenAI variables
- All Telegram variables
- All YouTube variables
- All cron secrets
- SendGrid API key

---

## Rollback Plan

If a variable removal causes issues:

1. **Immediate**: Re-add the variable to Netlify UI
2. **Investigate**: Check VPS `.env` and worker logs
3. **Fix**: Ensure variable is properly configured on VPS
4. **Retry**: Remove from Netlify again after fix

---

## Notes

- **No automatic deletion**: All removals are manual and user-confirmed
- **Gradual migration**: One variable (or small group) at a time
- **Safety first**: Verify VPS functionality before each removal
- **Documentation**: This file tracks migration progress

---

## Contact

For questions or issues during migration, refer to:
- VPS configuration: `server/` directory
- Netlify functions: `netlify/functions-lite/` directory
- This migration plan: `MIGRATION.md`
