# 🔍 NEWS PIPELINE ROOT CAUSE ANALYSIS

**Date:** 2026-01-11  
**Issue:** news-cron запускается успешно, но посты в Telegram не появляются

---

## 📊 CODE ANALYSIS RESULTS

### 1. ✅ RSS Sources — OK

**Location:** `netlify/functions/fetch-news.js:28-74`

**Result:**
- ✅ **9 источников** (3 RU, 3 EN, 3 DE)
- ✅ Массив статический, не пустой
- ✅ Нет условий блокировки
- ✅ Нет feature flags

**Ограничение:**
- `MAX_NEW_ITEMS_PER_RUN = 2` (максимум 2 новых элемента за запуск)

---

### 2. ⚠️ Fetch-news Logs — REQUIRES MANUAL CHECK

**Location:** Netlify Dashboard → Functions → fetch-news → Logs

**Что искать:**
- `processed: 0` → нет новых элементов (все уже обработаны)
- `processed: 2` → создано 2 темы (лимит)
- Error messages → ошибки OpenAI/Firebase

**Рекомендация:** Выполнить "Run now" и проверить логи сразу

---

### 3. ⚠️ Firebase Topics — REQUIRES MANUAL CHECK

**Location:** Firebase Console → Realtime Database → `/forum/topics`

**Query для проверки:**
```javascript
/forum/topics.json?orderBy="section"&equalTo="news"
```

**Что подсчитать:**
- **Total news topics:** количество тем с `section === "news"`
- **Pending for telegram:** количество тем БЕЗ `telegramPostedAt`

**Скрипт для проверки:**
```bash
node scripts/diagnose-news-pipeline.mjs
```

---

### 4. ✅ Filter Logic — CODE OK

**Location:** `netlify/functions/news-cron.js:318-321`

**Filter code:**
```javascript
const freshTopics = topics
  .filter((t) => !t.telegramPostedAt)  // БЕЗ telegramPostedAt
  .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
  .slice(0, limit);
```

**Query:**
```javascript
/forum/topics.json?orderBy="section"&equalTo="news"
```

**Условия:**
1. ✅ `section === "news"` (точное совпадение)
2. ✅ `!telegramPostedAt` (поле отсутствует или falsy)

**Потенциальные проблемы:**
- Если темы имеют `section: "News"` (с большой буквы) → не попадут
- Если темы имеют `telegramPostedAt: 0` (число) → должны попасть (0 = falsy)

---

## 🎯 ROOT CAUSE SCENARIOS

### Scenario A: Queue Empty (Most Likely)

**Symptoms:**
- Firebase: Все темы имеют `telegramPostedAt`
- news-cron logs: `processed: 0, message: "No new topics to post"`

**Root Cause:** Все новости уже опубликованы, очередь пуста

**Fix:**
1. Дождаться новых тем от fetch-news (запускается каждые 3 часа)
2. Или создать тестовую тему для проверки

**Verification:**
```bash
# Check Firebase
# Count topics without telegramPostedAt

# If 0 → Queue empty (normal state)
# If > 0 → Check Scenario B or C
```

---

### Scenario B: Fetch-news Not Creating Topics

**Symptoms:**
- Firebase: Нет тем с `section: "news"` или очень мало
- fetch-news logs: `processed: 0` постоянно

**Root Cause:** fetch-news не создает новые темы

**Possible Causes:**
1. Все новости уже в `/newsMeta/en.json` (обработаны)
2. Ошибки OpenAI API (нет ключа, лимиты, ошибки)
3. Ошибки Firebase (нет доступа, неправильный URL)
4. RSS источники недоступны

**Fix:**
1. Проверить env: `OPENAI_API_KEY`, `FIREBASE_DB_URL`
2. Проверить логи fetch-news на ошибки
3. Проверить `/newsMeta/en.json` (можно временно очистить для тестирования)

---

### Scenario C: Filter Mismatch

**Symptoms:**
- Firebase: Есть темы с `section: "news"` БЕЗ `telegramPostedAt`
- news-cron logs: `processed: 0`

**Root Cause:** Фильтр не находит темы из-за mismatch структуры

**Possible Causes:**
1. Теми имеют `section: "News"` (с большой буквы) → query не найдет
2. Теми имеют другое поле для отметки публикации
3. Структура данных не соответствует ожиданиям

**Fix:**
- Проверить фактические данные в Firebase
- Исправить структуру тем или фильтр

---

### Scenario D: Telegram Send Errors

**Symptoms:**
- Firebase: Есть темы БЕЗ `telegramPostedAt`
- news-cron logs: `processed: X, totalSent: 0`

**Root Cause:** Ошибки отправки в Telegram

**Fix:**
- Проверить env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_NEWS_CHAT_ID_*`
- Проверить логи на ошибки Telegram API

---

## 🔧 MINIMAL FIX (Based on Most Likely Scenario)

**Most Likely Root Cause:** Queue empty - all topics already published

**Fix:**
1. **Wait for fetch-news** to create new topics (runs every 3 hours)
2. **OR create test topic** to verify pipeline:
   ```bash
   node scripts/create-test-news-topic.mjs
   ```

**Alternative Fix (if fetch-news not working):**
1. Check fetch-news logs for errors
2. Verify env variables: `OPENAI_API_KEY`, `FIREBASE_DB_URL`
3. Check `/newsMeta/en.json` - if too large, may need cleanup

---

## ✅ VERIFICATION STEPS

### Step 1: Run Diagnostic Script

```bash
node scripts/diagnose-news-pipeline.mjs
```

**Expected Output:**
- Total topics count
- Unpublished topics count
- Filter simulation results
- Diagnosis

---

### Step 2: Check Netlify Logs

**fetch-news:**
1. Netlify Dashboard → Functions → fetch-news → Logs
2. Find last run
3. Check: `processed` count, error messages

**news-cron:**
1. Netlify Dashboard → Functions → news-cron → Logs
2. Find last run
3. Check: `processed`, `totalSent`, error messages

---

### Step 3: Manual Test

**Create test topic:**
```bash
node scripts/create-test-news-topic.mjs
```

**Run news-cron:**
1. Netlify Dashboard → Functions → news-cron → "Run now"
2. Check logs
3. Check Telegram

**Expected:**
- Topic gets `telegramPostedAt`
- Post appears in Telegram

---

## 📝 SUMMARY

**Code Analysis:** ✅ All checks passed

**Most Likely Root Cause:** Queue empty (all topics already published)

**Recommended Fix:**
1. Wait for fetch-news (every 3 hours)
2. OR create test topic for verification
3. Check logs if test fails

**Next Steps:**
1. Run diagnostic script: `node scripts/diagnose-news-pipeline.mjs`
2. Check Netlify logs (fetch-news and news-cron)
3. Create test topic and run news-cron manually

---

**Files Created:**
- `NEWS_PIPELINE_DIAGNOSIS_FULL.md` - Detailed analysis
- `scripts/diagnose-news-pipeline.mjs` - Diagnostic script
