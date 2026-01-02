# NovaCiv Repository Audit Summary

## Key Findings

### 1. Frontend (Vite/React)
- **Entry Point**: `src/main.tsx` → mounts `App.tsx`
- **Routing**: Manual routing in `App.tsx` (no React Router - uses `window.location.pathname` checks)
- **Pages Found**:
  - `Home.tsx`, `Index.tsx` (wrapper for Home)
  - `Vision.tsx` (standalone vision page)
  - `Manifesto-{ru,en,de,es}.tsx` (language-specific manifestos)
  - `Charter-{ru,en,de,es}.tsx` (language-specific charters)
  - `Charter.tsx`, `Manifesto.tsx` (language-aware wrappers)
  - `News.tsx`, `Join.tsx`, `ForumPage.tsx`, `TopicPage.tsx`, `NotFound.tsx`
- **Components**: Header, AssistantWidget, LanguageSwitcher, SupporterCounter, TopNav, + extensive UI component library (shadcn/ui)

### 2. Netlify Configuration
- **Config**: `netlify.toml` - functions in `netlify/functions/`, scheduled cron jobs
- **Scheduled Functions**: `news-cron` (hourly), `video-worker` (every 15 min)
- **Functions Found** (17 total):
  - AI: `ai-domovoy.js`, `ai-voice.js`
  - Video: `create-video-job.js`, `auto-create-video-job.js`, `generate-video.js`, `generate-video-background.js`, `test-video.js`, `video-worker-background.js`
  - Domovoy automation: `domovoy-auto-post.js`, `domovoy-auto-reply.js`, `domovoy-reply.js`
  - News: `fetch-news.js`, `news-cron.js`, `post-news-to-telegram.js`
  - Utilities: `post-to-telegram.js`, `send-email.js`, `hello.js`

### 3. Server Folder
- **Location**: `server/` (NOT used in Netlify production)
- **Contents**:
  - `video-worker.js` - Standalone continuous video worker (uses dotenv, runs in loop)
  - `youtube.js` - YouTube upload utility (used by video-worker)
- **Purpose**: For separate server deployment (local/remote server), not Netlify functions
- **Note**: Netlify uses `netlify/functions/video-worker-background.js` instead

### 4. Media/Video Pipeline
- **Pipeline Script**: `media/scripts/pipeline.js` - Core video generation (TTS + FFmpeg)
- **Backgrounds**: `media/backgrounds/{ru,en,de,es}/` - JPG images per language
- **Voices**: `media/voices/openai/` - Voice configs (nova_*_calm.json, nova_*_inspire.json)
- **Subtitles**: `media/subtitles/{charter,manifest}/` - Text files for video generation
- **Presets**: `media/shorts-presets/` - Video preset JSON files
- **Brand**: `media/brand/style.md` - Branding guidelines

### 5. Firebase Usage
- **Config**: `src/lib/firebase.ts` - Client-side Firebase initialization
- **Database**: Firebase Realtime Database (NOT Firestore)
- **Database URL**: `https://novaciv-web-default-rtdb.europe-west1.firebasedatabase.app`
- **No Rules Files**: No `firebase.json`, `database.rules.json`, or `firestore.rules` found in repo
- **Admin Usage**: Netlify functions use Firebase Admin SDK via `FIREBASE_SERVICE_ACCOUNT_JSON`

### 6. Outdated References in Current FILE_MAP
- ❌ `process-video-jobs.js` - doesn't exist (should be `video-worker-background.js`)
- ❌ `broadcast-news.js` - doesn't exist (should be `post-news-to-telegram.js`)
- ❌ `cron-domovoy-reply.js` - doesn't exist (should be `domovoy-auto-reply.js` or `domovoy-reply.js`)
- ❌ `cron-domovoy-news.js` - doesn't exist
- ❌ `send-contact-email.js` - should be `send-email.js`
- ❌ `firebaseAdmin.js` - not a separate file, each function initializes Firebase Admin directly
- ❌ React Router mentioned but not used (manual routing in App.tsx)
- ❌ `VisionPage.tsx` - should be `Vision.tsx`
- ❌ `JoinPage.tsx` - should be `Join.tsx`
- ❌ Missing: `Index.tsx`, `TopicPage.tsx`, `Charter.tsx`, `Manifesto.tsx` (wrappers)

### 7. How It Runs
- **Development**: `npm run dev` (Vite dev server)
- **Production (Netlify)**:
  - Frontend: Built via `npm run build` → `dist/` folder
  - Functions: Deployed from `netlify/functions/`
  - Scheduled: Cron jobs run `news-cron` and `video-worker` automatically
  - Media: Included in functions via `included_files = ["media/**"]` in netlify.toml
- **Separate Server** (optional): `server/video-worker.js` can run independently with dotenv

