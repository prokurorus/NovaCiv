# Health Monitoring

Автоматический мониторинг здоровья pipelines NovaCiv (News и Domovoy).

## Health Endpoints

### News Health

**URL:** `/.netlify/functions/health-news?token=<NEWS_CRON_SECRET>`

**Ответ:**
```json
{
  "ok": true,
  "fetch": {
    "ts": 1234567890000,
    "runId": "fetch-news-1234567890000",
    "sourcesOk": 9,
    "sourcesFailed": 0,
    "fetched": 45,
    "filtered": 2,
    "processed": 2
  },
  "cron": {
    "ts": 1234567890000,
    "runId": "news-cron-1234567890000",
    "fetchedTopics": 10,
    "processed": 5,
    "totalSent": 15,
    "perLanguage": {
      "ru": { "sent": 5 },
      "en": { "sent": 5 },
      "de": { "sent": 5 }
    }
  }
}
```

### Domovoy Health

**URL:** `/.netlify/functions/health-domovoy?token=<NEWS_CRON_SECRET>`

**Ответ:**
```json
{
  "ok": true,
  "autoPost": {
    "ts": 1234567890000,
    "runId": "domovoy-post-1234567890000",
    "ok": true,
    "postedPerLang": { "ru": 1, "en": 0, "de": 0 },
    "telegramSentPerLang": { "ru": 1, "en": 0, "de": 0 },
    "errCode": null
  },
  "autoReply": {
    "ts": 1234567890000,
    "runId": "domovoy-reply-1234567890000",
    "ok": true,
    "scanned": 40,
    "repliedPerLang": { "ru": 2, "en": 1, "de": 0 },
    "errCode": null
  }
}
```

## GitHub Secrets

Для GitHub Actions workflow `.github/workflows/pipeline-health.yml` нужны следующие secrets:

- `NEWS_BASE_URL` — базовый URL сайта (например `https://novaciv.space`)
- `DOMOVOY_BASE_URL` — базовый URL для Domovoy (можно использовать тот же `NEWS_BASE_URL`)
- `NEWS_CRON_SECRET` — токен для доступа к health endpoints (единый токен)

**Настройка secrets:**
1. Перейти в Settings → Secrets and variables → Actions
2. Добавить каждый secret с соответствующим значением

## SLA Пороги

### News Pipeline

- **fetch-news:** максимум 90 минут с последнего запуска
- **news-cron:** максимум 90 минут с последнего запуска

### Domovoy Pipeline

- **auto-post:** максимум 26 часов с последнего запуска
- **auto-reply:** максимум 20 минут с последнего запуска

## Что означает processed=0

**processed=0 — это НЕ ошибка**, это нормальное состояние когда:

- **fetch-news:** все RSS источники уже обработаны, новых новостей нет
- **news-cron:** все темы уже отправлены в Telegram, новых тем нет

Важно: метрики с `processed=0` всё равно пишутся в Firebase (heartbeat), чтобы подтвердить, что scheduler работает.

## Интерпретация статусов

### Здоровый pipeline

- `ok: true` в метриках
- `ts` (timestamp) свежий (в пределах SLA)
- `processed > 0` или `processed = 0` (оба варианта нормальны)

### Проблемы

1. **"no metrics found"** — scheduler не запускается (проверить Netlify Scheduled Functions)
2. **"last run X ago (max Y)"** — scheduler не работает (превышен SLA порог)
3. **`ok: false`** — последний запуск завершился ошибкой (проверить `errCode`)
4. **`errCode: "FIREBASE"`** — проблема с Firebase
5. **`errCode: "OPENAI"`** — проблема с OpenAI API
6. **`errCode: "TELEGRAM"`** — проблема с Telegram API

## Что делать при красном workflow

1. Проверить health endpoint напрямую: `curl "https://novaciv.space/.netlify/functions/health-news?token=..." | jq`
2. Проверить логи Netlify Functions в Netlify Dashboard
3. Проверить, что Netlify Scheduled Functions включены и настроены в `netlify.toml`
4. Проверить переменные окружения в Netlify (FIREBASE_DB_URL, OPENAI_API_KEY, TELEGRAM_BOT_TOKEN и т.д.)
5. Проверить Firebase Realtime Database на наличие метрик в `/health/news/*` и `/health/domovoy/*`

## Локальная проверка

```bash
# News
node scripts/check-health-news.mjs

# Domovoy
node scripts/check-health-domovoy.mjs
```

**Требования:**
- `.env` файл с `NEWS_BASE_URL`, `NEWS_CRON_SECRET`
- `npm ci` выполнен (зависимости установлены)
