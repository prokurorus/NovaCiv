# NovaCiv Runtime Architecture (Netlify vs VPS)

Scope: runtime split with focus on news/domovoy pipelines and secrets flow. Source: `netlify.toml`, `netlify/functions/*`, `server/*`, `scripts/*`, `runbooks/stability_report_daily.sh`, `ecosystem.config.cjs`, `MIGRATION.md`.

## A) What Runs on Netlify

**Configured functions directory:** `netlify/functions` (per `netlify.toml`). `netlify/functions-lite` exists but is not wired in `netlify.toml`.

**Scheduled functions:** none in `netlify.toml` (cron removed). All Netlify functions are HTTP-triggered unless invoked by other functions.

**HTTP-triggered functions (news/domovoy focus):**
- `fetch-news` → HTTP trigger; validates `NEWS_CRON_SECRET` for manual calls; triggers `fetch-news-background`.
- `fetch-news-background` → invoked by `fetch-news` (background pipeline: RSS → OpenAI → Firebase).
- `news-cron` → HTTP trigger; posts news from Firebase to Telegram; expects `NEWS_CRON_SECRET` for manual calls.
- `domovoy-auto-post` → HTTP trigger; generates post + saves to Firebase + Telegram; expects `DOMOVOY_CRON_SECRET`.
- `domovoy-auto-reply` → HTTP trigger; replies in forum comments; expects `DOMOVOY_CRON_SECRET`.
- `domovoy-every-3h` → HTTP trigger; posts seeded Domovoy content; expects `DOMOVOY_CRON_SECRET`.
- `ops-run-now` → HTTP trigger; orchestrates fetch-news/news-cron/maintenance; expects `OPS_CRON_SECRET`.
- `health-news` / `health-domovoy` → HTTP health checks; token-gated by `NEWS_CRON_SECRET`.
- `env-probe` → HTTP probe for Firebase env presence (names only).
- `admin-proxy` → HTTP proxy to VPS admin API (`/admin/domovoy` or `/admin/direct`).

**Redirects / SPA:** `netlify.toml` routes `/*` → `/index.html`.

## B) What Runs on VPS

**PM2 processes** (`ecosystem.config.cjs`):
- `nova-admin-domovoy` → `server/admin-domovoy-api.js` (HTTP: `POST /admin/domovoy`, `POST /admin/direct` on port `ADMIN_DOMOVOY_PORT`, default 3001).
- `nova-ops-agent` → `server/ops-agent.js` (GitHub ops agent).
- `nova-video` → `server/video-worker.js` (video pipeline; not the focus here but in PM2).

**VPS-only services / scripts (news/domovoy focus):**
- `server/lib/firebaseAdmin.js` + `server/config/firebase-config.js` → Firebase Admin init (service account JSON).
- `server/lib/healthMetrics.js`, `server/lib/opsPulse.js` → write health/ops metrics to Firebase.
- `server/nova-news-worker.js` → news jobs queue worker (present but not wired to PM2; TODO in code).
- `runbooks/stability_report_daily.sh` → cron example for daily stability report (`node server/ops-stability-report.js`).

**Admin endpoints used by Netlify `admin-proxy`:**
- `POST http://<VPS>:3001/admin/domovoy`
- `POST http://<VPS>:3001/admin/direct`

## C) Secrets Needed Per Component (Names Only)

**Netlify (current `netlify/functions`):**
- `admin-proxy`: `ADMIN_DOMOVOY_API_URL`, `ADMIN_API_TOKEN`
- `fetch-news` / `fetch-news-background`: `OPENAI_API_KEY`, `OPENAI_MODEL` (optional), `FIREBASE_DB_URL`, `NEWS_CRON_SECRET`, `ALLOW_NETLIFY_RUN_NOW_BYPASS` (optional)
- `news-cron`: `FIREBASE_DB_URL`, `NEWS_CRON_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_NEWS_CHAT_ID`, `TELEGRAM_NEWS_CHAT_ID_RU`, `TELEGRAM_NEWS_CHAT_ID_DE`, `OPENAI_API_KEY` (for translations), `OPENAI_MODEL` (optional)
- `domovoy-auto-post`: `OPENAI_API_KEY`, `OPENAI_MODEL` (optional), `FIREBASE_DB_URL`, `DOMOVOY_CRON_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_NEWS_CHAT_ID`, `TELEGRAM_NEWS_CHAT_ID_RU`, `TELEGRAM_NEWS_CHAT_ID_DE`
- `domovoy-auto-reply`: `OPENAI_API_KEY`, `OPENAI_MODEL` (optional), `FIREBASE_DB_URL`, `DOMOVOY_CRON_SECRET`, `FIREBASE_SERVICE_ACCOUNT_JSON`
- `domovoy-every-3h`: `OPENAI_API_KEY`, `OPENAI_MODEL` (optional), `FIREBASE_DB_URL`, `DOMOVOY_CRON_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_NEWS_CHAT_ID`, `TELEGRAM_NEWS_CHAT_ID_RU`, `TELEGRAM_NEWS_CHAT_ID_DE`
- `ops-run-now`: `OPS_CRON_SECRET` (+ any env used by invoked functions)
- `health-news` / `health-domovoy`: `FIREBASE_DB_URL`, `NEWS_CRON_SECRET`
- `env-probe`: `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_DB_URL`, `FIREBASE_DATABASE_URL` (presence only)

**VPS (server-side):**
- `admin-domovoy-api`: `ADMIN_API_TOKEN`, `OPENAI_API_KEY`, `ADMIN_DOMOVOY_PORT`, `PROJECT_DIR`, `ENV_PATH` (optional), `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_DB_URL` / `FIREBASE_DATABASE_URL`
- `ops-agent`: `GITHUB_TOKEN`, `PROJECT_DIR`, `ENV_PATH` (optional)
- `nova-news-worker` (if enabled): `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_DB_URL` / `FIREBASE_DATABASE_URL`
- Shared libs (Firebase/health): `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_DB_URL` / `FIREBASE_DATABASE_URL`

**Must NOT be on Netlify (AWS Lambda 4KB env limit):**
- `FIREBASE_SERVICE_ACCOUNT_JSON` (largest single var; exceeds/consumes limit)
- Any other large combined secret sets if Netlify hosts heavy functions (OpenAI + Telegram + YouTube + Firebase).

## D) Current Problem (Deploy Fails) — Why, and What Changed

**Root cause from repo state:**
- `MIGRATION.md` declares Netlify should use `netlify/functions-lite` with only `admin-proxy`, but `netlify.toml` still points to `netlify/functions`.
- This mismatch causes Netlify to bundle/deploy **heavy functions** that require large env vars (notably `FIREBASE_SERVICE_ACCOUNT_JSON`), pushing total env size over the AWS Lambda ~4KB limit.
- The recent migration plan removed schedules in `netlify.toml` but did **not** switch the functions directory. Netlify is still packaging the heavy functions set, so deploy/bundling errors persist (see `NETLIFY_502_DIAGNOSIS.md` for the ops-run-now bundling symptom).

## E) Recommended Target Architecture (Netlify-lite + VPS-heavy)

- **Netlify:** only lightweight HTTP proxy/health endpoints (`admin-proxy`, `health-news`, `health-domovoy`, optional `public-*` + `env-probe`), with minimal env vars.
- **VPS:** all heavy pipelines (news fetch + cron posting, domovoy auto-post/auto-reply, Firebase Admin operations), all scheduled jobs and PM2 workers.
- **Scheduled jobs:** VPS cron/PM2 should drive news/domovoy pipelines; Netlify schedules remain off.

## F) Concrete Next Actions (Checklist, max 10)

1. **LOCAL:** Update `netlify.toml` to point functions directory at `netlify/functions-lite` and remove heavy functions from Netlify deploy surface.
2. **NETLIFY UI:** Remove heavy env vars from Netlify after VPS verification, starting with `FIREBASE_SERVICE_ACCOUNT_JSON`.
3. **VPS:** Ensure `.env` has all heavy secrets (`FIREBASE_*`, `OPENAI_*`, `TELEGRAM_*`, `DOMOVOY_*`, `NEWS_CRON_SECRET`, `OPS_CRON_SECRET`).
4. **VPS:** Start/verify PM2 processes (`nova-admin-domovoy`, news/domovoy worker(s) if enabled).
5. **VPS:** Implement or wire news/domovoy schedulers (cron or PM2 loop) to replace Netlify schedules.
6. **LOCAL:** Keep `admin-proxy` pointing to `ADMIN_DOMOVOY_API_URL` and verify `POST /admin/domovoy` and `POST /admin/direct`.
7. **LOCAL:** Use `scripts/check-health-news.mjs` and `scripts/check-health-domovoy.mjs` to validate health endpoints.
8. **NETLIFY UI:** Redeploy with cache clear to ensure new functions directory is used.
9. **VPS:** Add cron for stability report if desired (see `runbooks/stability_report_daily.sh` example).
