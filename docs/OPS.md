# Операторский пульт NovaCiv

**Единая точка мониторинга состояния всех компонентов системы.**

---

## 📊 Где смотреть статусы

### Firebase Realtime Database

**Heartbeat статусы:** `/ops/heartbeat/{component}`

Компоненты:
- `fetch-news` — сбор новостей из RSS
- `news-cron` — отправка новостей в Telegram
- `domovoy-auto-post` — авто-посты Домового
- `domovoy-auto-reply` — авто-ответы Домового

**Структура heartbeat:**
```json
{
  "lastRunAt": 1234567890000,
  "lastOkAt": 1234567890000,
  "lastErrorAt": null,
  "lastErrorMsg": null,
  "updatedAt": 1234567890000,
  "createdTopicsCount": 2,
  "sentToTelegramCount": 6,
  "fetchedTopicsCount": 10
}
```

**События:** `/ops/events` (кольцевой буфер, последние 20 событий)

**Структура события:**
```json
{
  "ts": 1234567890000,
  "component": "fetch-news",
  "level": "info|warn|error",
  "message": "Processed 2 news items",
  "meta": {}
}
```

### Firebase Console

1. Откройте [Firebase Console](https://console.firebase.google.com/)
2. Выберите проект `novaciv-web`
3. Перейдите в **Realtime Database** → **Data**
4. Откройте `/ops/heartbeat` и `/ops/events`

---

## 🧪 Smoke Test

**Путь:** `tools/ops-smoke-test.js`

**Что делает:**
- Читает heartbeat статусы всех компонентов
- Проверяет, что функции выполнялись за последние X часов (по умолчанию 24)
- Проверяет наличие ошибок
- Выводит последние 5 событий
- Возвращает OK/FAIL с причинами

**Запуск:**
```bash
# Проверка за последние 24 часа (по умолчанию)
node tools/ops-smoke-test.js

# Проверка за последние 12 часов
node tools/ops-smoke-test.js --hours=12

# Проверка за последние 48 часов
node tools/ops-smoke-test.js --hours=48
```

**Ожидаемый результат:**
```
[ops-smoke-test] Checking heartbeat statuses (max age: 24 hours)...
[ops-smoke-test] fetch-news: OK (last run: 2h ago)
  └─ createdTopicsCount: 2
[ops-smoke-test] news-cron: OK (last run: 1h ago)
  └─ sentToTelegramCount: 6
  └─ fetchedTopicsCount: 10

[ops-smoke-test] Recent events:
  [info] fetch-news: Processed 2 news items (30m ago)
  [info] news-cron: Sent 6 messages to Telegram (60m ago)

[ops-smoke-test] OK - All components are healthy
```

**Если FAIL:**
```
[ops-smoke-test] FAIL - Issues found:
  - fetch-news: last run 25 hours ago (max: 24h)
  - news-cron: last error 2h ago - Firebase index missing
```

---

## 🔧 Типовые ошибки и решения

### 1. Index not defined (Firebase 400)

**Симптомы:**
- `news-cron` падает с ошибкой 400
- В логах: "Index not defined" или "index not found"
- Heartbeat показывает `lastErrorMsg` с упоминанием индекса

**Решение:**
1. Откройте Firebase Console → Realtime Database → Rules
2. Добавьте индекс для `/forum/topics`:
   ```json
   {
     "rules": {
       "forum": {
         "topics": {
           ".indexOn": ["section"]
         }
       }
     }
   }
   ```
3. Нажмите **Publish**
4. Подробнее: см. [docs/FIREBASE_ADMIN.md](./FIREBASE_ADMIN.md)

**Временное решение:**
- `news-cron` автоматически использует fallback (full-scan) при отсутствии индекса
- В логах будет WARNING: "firebase missing index on section; using full-scan fallback"
- Это медленнее, но работает

---

### 2. Auth / Token errors

**Симптомы:**
- Heartbeat показывает `lastErrorMsg` с "Forbidden" или "invalid token"
- Функции не выполняются при ручном запуске

**Решение:**
1. Проверьте переменные окружения в Netlify Dashboard:
   - `NEWS_CRON_SECRET` (для news-cron)
   - `DOMOVOY_CRON_SECRET` (для domovoy функций)
2. При ручном запуске добавьте `?token=<SECRET>` в URL
3. Для "Run now" в Netlify Dashboard:
   - Установите `ALLOW_NETLIFY_RUN_NOW_BYPASS=true` (временно)
   - Или используйте токен в query параметрах

---

### 3. Telegram API errors

**Симптомы:**
- `news-cron` или `domovoy-auto-post` падают с ошибками Telegram
- В heartbeat: `lastErrorMsg` содержит "Telegram error" или "chat not found"

**Решение:**
1. Проверьте переменные окружения:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_NEWS_CHAT_ID_RU`
   - `TELEGRAM_NEWS_CHAT_ID_EN`
   - `TELEGRAM_NEWS_CHAT_ID_DE`
2. Проверьте, что бот добавлен в каналы и имеет права на отправку сообщений
3. Проверьте, что chat IDs корректны (начинаются с `-100` для каналов)

---

### 4. OpenAI API errors

**Симптомы:**
- `fetch-news` или `domovoy-auto-post` падают с ошибками OpenAI
- В heartbeat: `lastErrorMsg` содержит "OpenAI API error" или "rate limit"

**Решение:**
1. Проверьте `OPENAI_API_KEY` в Netlify Dashboard
2. Проверьте лимиты API в [OpenAI Dashboard](https://platform.openai.com/usage)
3. При rate limit — подождите или увеличьте лимит

---

### 5. Компонент не запускается

**Симптомы:**
- Heartbeat показывает `lastRunAt` старше 24 часов
- Нет новых событий в `/ops/events`

**Решение:**
1. Проверьте scheduled functions в `netlify.toml`:
   ```toml
   [functions]
     fetch-news = { schedule = "0 */3 * * *" }
     news-cron = { schedule = "0 * * * *" }
   ```
2. Проверьте логи в Netlify Dashboard → Functions → Logs
3. Проверьте, что функции не отключены в Netlify Dashboard

---

## 📈 Интерпретация метрик

### fetch-news
- `createdTopicsCount` — количество созданных тем за последний запуск
- Если `0` — нет новых новостей (нормально)
- Если `> 0` — новости обработаны успешно

### news-cron
- `fetchedTopicsCount` — количество тем, полученных из Firebase
- `sentToTelegramCount` — количество сообщений, отправленных в Telegram
- Если `sentToTelegramCount = 0` при `fetchedTopicsCount > 0` — возможна проблема с Telegram

### domovoy-auto-post
- `createdPostsCount` — количество созданных постов
- Ожидается `1` за запуск (один пост)

### domovoy-auto-reply
- `repliedCount` — количество отправленных ответов
- Ожидается `0-5` за запуск (максимум 5 ответов)

---

## 🔍 Быстрая диагностика

**30 секунд на проверку:**

1. Запустите smoke-test:
   ```bash
   node tools/ops-smoke-test.js
   ```

2. Если FAIL — проверьте:
   - Какие компоненты не запускались
   - Какие ошибки в `lastErrorMsg`
   - Последние события в `/ops/events`

3. Типовые проблемы:
   - **Index missing** → применить индекс (см. выше)
   - **Auth error** → проверить токены
   - **Telegram error** → проверить chat IDs
   - **OpenAI error** → проверить API key и лимиты

---

## 📚 Дополнительные ресурсы

- [Firebase Admin Setup](./FIREBASE_ADMIN.md)
- [Netlify Functions Logs](https://app.netlify.com/sites/novaciv/functions)
- [Firebase Console](https://console.firebase.google.com/project/novaciv-web/database)

---

*Документ обновляется при изменениях в системе.*
