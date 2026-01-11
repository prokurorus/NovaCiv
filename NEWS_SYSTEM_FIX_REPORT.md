# Отчет: Исправление системы новостей и Telegram-публикации

**Дата:** 2024  
**Цель:** Устранение проблемы, когда ежедневный выпуск новостей появляется только в одном Telegram-канале

---

## Часть 1: ВЕРИФИКАЦИЯ ПРОБЛЕМЫ

### 1.1 Анализ news-cron.js

**Файл:** `netlify/functions/news-cron.js`  
**Проблемные строки:** 185-218

#### Найденные проблемы:

1. **Отправка во все каналы без проверки языка** (строки 190-215):
   - Код отправляет каждую новость во ВСЕ три канала (RU/EN/DE) независимо от `topic.lang`
   - Нет проверки `topic.lang` перед отправкой
   - Если новость имеет `lang: "ru"`, она все равно отправляется в EN и DE каналы

2. **Некорректная обработка пустых chat_id** (строки 190, 199, 208):
   - Если `TELEGRAM_NEWS_CHAT_ID_RU` пустой/undefined, задача просто не добавляется в `tasks[]`
   - Но `telegramPostedAt` все равно ставится (строка 218)
   - Результат: пост помечается как отправленный, хотя в RU канал не ушел

3. **Некорректная обработка ошибок отправки** (строки 217-218):
   - `Promise.all(tasks)` ждет завершения всех промисов, но не проверяет успешность
   - Если отправка в один канал упала с ошибкой, `telegramPostedAt` все равно ставится
   - Результат: пост помечается как отправленный, хотя в один/несколько каналов не ушел

4. **Глобальная отметка telegramPostedAt** (строка 218):
   - `markTopicAsPosted(topic.id)` вызывается ПОСЛЕ `Promise.all(tasks)`
   - Не проверяется, успешно ли прошла отправка хотя бы в один канал
   - Если все отправки упали, пост все равно помечается как отправленный

### 1.2 Проверка переменных окружения

**Строки 11-14:**
```javascript
const TELEGRAM_NEWS_CHAT_ID_EN =
  process.env.TELEGRAM_NEWS_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_NEWS_CHAT_ID_RU = process.env.TELEGRAM_NEWS_CHAT_ID_RU;
const TELEGRAM_NEWS_CHAT_ID_DE = process.env.TELEGRAM_NEWS_CHAT_ID_DE;
```

**Проблема:**
- Если какой-то из `TELEGRAM_NEWS_CHAT_ID_*` пустой/undefined, код просто пропускает отправку в этот канал
- Но `telegramPostedAt` ставится глобально, что блокирует повторную попытку

### 1.3 Проверка feature flags

**Результат:** В `news-cron.js` НЕТ проверок feature flags (в отличие от `video-worker.js`).  
Feature flags не влияют на публикацию новостей.

### 1.4 Вывод: почему пост иногда в одном канале

**Корневая причина:**

1. **Неправильная логика рассылки:**
   - Новость с `lang: "ru"` отправляется во все каналы (RU/EN/DE)
   - Если EN или DE канал не настроен или упал, новость все равно помечается как отправленная
   - При следующем запуске новость пропускается (уже есть `telegramPostedAt`)

2. **Некорректная обработка ошибок:**
   - Если отправка в один канал упала, `telegramPostedAt` все равно ставится
   - Пост больше не будет отправлен при следующем запуске

3. **Отсутствие проверки языка:**
   - Нет связи между `topic.lang` и выбором канала
   - Все новости идут во все каналы, что может приводить к дублям и путанице

**Конкретные строки кода:**
- Строки 190-215: отправка во все каналы без проверки `topic.lang`
- Строка 218: `markTopicAsPosted` вызывается без проверки успешности отправки

---

## Часть 2: ПРАВИЛЬНАЯ ЛОГИКА РАССЫЛКИ ПО ЯЗЫКАМ

### 2.1 Минимальный патч для news-cron.js

**Изменения:**

1. **Проверка языка темы:**
   - Отправлять новость только в канал, соответствующий `topic.lang`
   - Если `topic.lang === "ru"` → только `TELEGRAM_NEWS_CHAT_ID_RU`
   - Если `topic.lang === "en"` → только `TELEGRAM_NEWS_CHAT_ID_EN`
   - Если `topic.lang === "de"` → только `TELEGRAM_NEWS_CHAT_ID_DE`

2. **Защита от пустых chat_id:**
   - Если chat_id для нужного языка не задан → логировать WARN
   - НЕ ставить `telegramPostedAt`, чтобы не потерять пост
   - Продолжить обработку следующей новости

3. **Корректная отметка telegramPostedAt:**
   - Ставить `telegramPostedAt` ТОЛЬКО если отправка успешна (`res.ok === true`)
   - Если отправка упала → НЕ ставить `telegramPostedAt`, чтобы повторить при следующем запуске

### 2.2 Код-патч

**Файл:** `netlify/functions/news-cron.js`  
**Строки:** 179-219

**Было:**
```javascript
const perLanguage = {
  ru: { sent: 0, errors: [] },
  en: { sent: 0, errors: [] },
  de: { sent: 0, errors: [] },
};

for (const topic of freshTopics) {
  const text = buildPostText(topic);
  const tasks = [];

  if (TELEGRAM_NEWS_CHAT_ID_RU) {
    tasks.push(sendToTelegram(TELEGRAM_NEWS_CHAT_ID_RU, text).then(...));
  }
  if (TELEGRAM_NEWS_CHAT_ID_EN) {
    tasks.push(sendToTelegram(TELEGRAM_NEWS_CHAT_ID_EN, text).then(...));
  }
  if (TELEGRAM_NEWS_CHAT_ID_DE) {
    tasks.push(sendToTelegram(TELEGRAM_NEWS_CHAT_ID_DE, text).then(...));
  }

  await Promise.all(tasks);
  await markTopicAsPosted(topic.id);
}
```

**Стало:**
```javascript
const perLanguage = {
  ru: { sent: 0, errors: [] },
  en: { sent: 0, errors: [] },
  de: { sent: 0, errors: [] },
};

for (const topic of freshTopics) {
  const topicLang = (topic.lang || "en").toLowerCase();
  const text = buildPostText(topic);

  // Определяем, в какой канал отправлять (только соответствующий языку темы)
  let targetChatId = null;
  let targetLangCode = null;

  if (topicLang === "ru" && TELEGRAM_NEWS_CHAT_ID_RU) {
    targetChatId = TELEGRAM_NEWS_CHAT_ID_RU;
    targetLangCode = "ru";
  } else if (topicLang === "en" && TELEGRAM_NEWS_CHAT_ID_EN) {
    targetChatId = TELEGRAM_NEWS_CHAT_ID_EN;
    targetLangCode = "en";
  } else if (topicLang === "de" && TELEGRAM_NEWS_CHAT_ID_DE) {
    targetChatId = TELEGRAM_NEWS_CHAT_ID_DE;
    targetLangCode = "de";
  }

  // Если канал для языка не настроен - логируем WARN и пропускаем
  if (!targetChatId) {
    log(`WARN: Topic ${topic.id} (lang=${topicLang}) skipped - no chat_id configured`);
    continue; // НЕ ставим telegramPostedAt
  }

  // Отправляем только в соответствующий канал
  let sendSuccess = false;
  try {
    const res = await sendToTelegram(targetChatId, text);
    if (res && res.ok) {
      sendSuccess = true;
      perLanguage[targetLangCode].sent += 1;
    } else if (res && !res.skipped) {
      perLanguage[targetLangCode].errors.push(res);
    }
  } catch (err) {
    log(`Exception sending topic ${topic.id} to ${targetLangCode}:`, err);
    perLanguage[targetLangCode].errors.push({ error: String(err.message || err) });
  }

  // Ставим telegramPostedAt ТОЛЬКО если отправка успешна
  if (sendSuccess) {
    await markTopicAsPosted(topic.id);
  } else {
    log(`Topic ${topic.id} NOT marked as posted - will retry on next run`);
  }
}
```

**Ключевые изменения:**
- ✅ Проверка `topic.lang` перед отправкой
- ✅ Отправка только в соответствующий канал
- ✅ Защита от пустых chat_id (WARN + пропуск без отметки)
- ✅ `telegramPostedAt` ставится только при успешной отправке

---

## Часть 3: СТАБИЛЬНОСТЬ СБОРА НОВОСТЕЙ (fetch-news.js)

### 3.1 MAX_NEW_ITEMS_PER_RUN

**Текущее значение:** `2` (строка 22)  
**Проблема:** Слишком мало для стабильного покрытия

**Обоснование:**
- Один RSS item порождает несколько языков (en/ru/de)
- При `MAX_NEW_ITEMS_PER_RUN = 2` и 3 языках получается максимум 6 постов
- Но если источники тихие или фильтр свежести отбрасывает много новостей, может быть 0 постов

**Рекомендуемое значение:** `5`
- Дает запас для фильтрации по свежести
- Обеспечивает стабильное покрытие даже при тихих новостях
- Не перегружает OpenAI API (анализ + переводы)

**Изменение:**
```javascript
const MAX_NEW_ITEMS_PER_RUN = 5; // было 2
```

### 3.2 Таймаут на fetch RSS

**Проблема:** Нет таймаута на `fetch(source.url)`, что может привести к зависанию при медленных источниках.

**Решение:** Добавить `AbortController` с таймаутом 15 секунд.

**Код:**
```javascript
const RSS_FETCH_TIMEOUT_MS = 15000; // 15 секунд

async function fetchRssSource(source) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RSS_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(source.url, { signal: controller.signal });
    clearTimeout(timeoutId);
    // ... остальной код
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error(`RSS fetch timeout for ${source.id}`);
    }
    throw err;
  }
}
```

### 3.3 Фильтр свежести: 48 часов

**Проблема:** Нет фильтра по свежести, могут попадать старые новости.

**Решение:** Добавить фильтр по `pubDate` (максимум 48 часов).

**Код:**
```javascript
const MAX_AGE_HOURS = 48;

// В handler, после загрузки всех источников:
const now = Date.now();
const maxAgeMs = MAX_AGE_HOURS * 60 * 60 * 1000;
let countNoDate = 0;
let countTooOld = 0;

const freshItems = allItems.filter((item) => {
  if (!item.pubDate) {
    countNoDate += 1;
    return false; // Отбрасываем без даты
  }

  try {
    const pubTime = new Date(item.pubDate).getTime();
    if (isNaN(pubTime)) {
      countNoDate += 1;
      return false;
    }

    const age = now - pubTime;
    if (age > maxAgeMs) {
      countTooOld += 1;
      return false;
    }

    return true;
  } catch (e) {
    countNoDate += 1;
    return false;
  }
});

if (countNoDate > 0) {
  console.log(`[fetch-news] Filtered out ${countNoDate} items without valid pubDate`);
}
if (countTooOld > 0) {
  console.log(`[fetch-news] Filtered out ${countTooOld} items older than ${MAX_AGE_HOURS}h`);
}
```

### 3.4 Лог-отчет по источникам

**Добавлено:**
```javascript
const sourceStats = {
  ok: 0,
  failed: 0,
  failedSources: [],
};

// После обработки всех источников:
console.log(
  `[fetch-news] Sources: ${sourceStats.ok} OK, ${sourceStats.failed} failed. Items fetched: ${allItems.length}`
);
```

### 3.5 Итоговые изменения в fetch-news.js

1. ✅ `MAX_NEW_ITEMS_PER_RUN = 5` (было 2)
2. ✅ Таймаут 15 секунд на RSS fetch
3. ✅ Фильтр свежести 48 часов
4. ✅ Логирование количества источников OK/failed и items fetched
5. ✅ Логирование количества отброшенных новостей (без даты / слишком старых)

---

## Часть 4: РАСШИРЕНИЕ ИСТОЧНИКОВ

### 4.1 Текущее состояние

**RU (3 источника):**
- BBC Russian
- DW Russian
- Meduza

**EN (3 источника):**
- BBC World
- DW World (EN)
- The Guardian World

**DE (2 источника):**
- Tagesschau
- DW German

**Проблема:** DE имеет только 2 источника, что может приводить к пустоте при тихих новостях.

### 4.2 Рекомендуемые источники-кандидаты

**⚠️ ВАЖНО:** Без доступа к интернету я не могу гарантировать точные RSS URL.  
Рекомендую проверить каждый источник перед добавлением.

#### EN (English) - 8-12 источников

**Politics:**
- Reuters World: `https://www.reuters.com/rssFeed/worldNews` (проверить точный URL)
- AP News: `https://apnews.com/apf-topnews` (проверить точный URL)
- Politico: `https://www.politico.com/rss/politicopicks.xml` (проверить)

**Economics:**
- Financial Times: `https://www.ft.com/?format=rss` (проверить точный URL)
- Bloomberg: `https://www.bloomberg.com/feed/topics/economics` (проверить)
- The Economist: `https://www.economist.com/rss.xml` (проверить)

**Environment:**
- Climate Home News: `https://www.climatechangenews.com/feed/` (проверить)
- Inside Climate News: `https://insideclimatenews.org/feed/` (проверить)

**Science-Tech:**
- Nature News: `https://www.nature.com/nature.rss` (проверить)
- Science Magazine: `https://www.science.org/rss/news_current.xml` (проверить)
- MIT Technology Review: `https://www.technologyreview.com/feed/` (проверить)

#### RU (Russian) - 6-10 источников

**Politics:**
- RFE/RL Russian: `https://www.rferl.org/api/z$qypi$qp` (проверить точный URL)
- Current Time TV: `https://www.currenttime.tv/api/z$qypi$qp` (проверить)

**Economics:**
- Коммерсант (если есть RSS): проверить наличие RSS
- Ведомости (если есть RSS): проверить наличие RSS

**Environment:**
- Bellona (экология): `https://bellona.ru/feed` (проверить)
- ЭкоДело: проверить наличие RSS

**Science-Tech:**
- N+1 (наука): `https://nplus1.ru/rss` (проверить)
- Хабр (технологии): `https://habr.com/ru/rss/all/all/` (проверить)

#### DE (German) - 6-10 источников

**Politics:**
- Spiegel Online: `https://www.spiegel.de/schlagzeilen/index.rss` (проверить)
- Süddeutsche Zeitung: `https://www.sueddeutsche.de/rss` (проверить)
- Die Zeit: `https://www.zeit.de/index` (проверить точный RSS URL)

**Economics:**
- Handelsblatt: `https://www.handelsblatt.com/contentexport/feed/rss` (проверить)
- WirtschaftsWoche: проверить наличие RSS

**Environment:**
- Klimareporter: `https://www.klimareporter.de/rss` (проверить)
- Deutsche Welle Environment (DE): `https://rss.dw.com/rdf/rss-de-umwelt` (проверить)

**Science-Tech:**
- Spektrum der Wissenschaft: `https://www.spektrum.de/rss` (проверить)
- Golem.de: `https://www.golem.de/rss` (проверить)

### 4.3 Где добавлять источники

**Файл:** `netlify/functions/fetch-news.js`  
**Строки:** 36-74 (массив `SOURCES`)

**Формат:**
```javascript
{
  id: "unique_source_id",
  url: "https://...rss.xml",
  languages: ["en"], // или ["ru"], ["de"], или ["en", "ru"] для мультиязычных
}
```

**Опциональные поля (без ломки текущего кода):**
Можно добавить поля `category` и `priority` для будущего использования:
```javascript
{
  id: "reuters_world",
  url: "https://...",
  languages: ["en"],
  category: "politics", // опционально: "politics" | "economics" | "environment" | "science"
  priority: 1, // опционально: 1-5, где 5 = высший приоритет
}
```

Эти поля не используются в текущем коде, но могут быть полезны для будущих улучшений (фильтрация по категориям, приоритизация источников).

### 4.4 Чек-лист проверки RSS перед добавлением

1. **Проверить доступность RSS:**
   ```bash
   curl -I "https://example.com/rss.xml"
   # Должен вернуть 200 OK
   ```

2. **Проверить структуру RSS:**
   ```bash
   curl "https://example.com/rss.xml" | head -50
   # Должен содержать <item> с <title>, <link>, <pubDate>, <description>
   ```

3. **Проверить частоту обновлений:**
   - Открыть RSS в браузере
   - Проверить даты последних новостей (должны быть свежие, не старше 24-48 часов)

4. **Проверить язык контента:**
   - Убедиться, что новости действительно на нужном языке
   - Некоторые источники могут быть мультиязычными

5. **Проверить категорию:**
   - Убедиться, что источник соответствует категории (политика/экономика/экология/наука)

6. **Добавить в SOURCES:**
   - Добавить в массив `SOURCES` в `fetch-news.js`
   - Указать правильный `id` (уникальный)
   - Указать `languages` (массив языков)

7. **Протестировать:**
   - Запустить `fetch-news.js` вручную
   - Проверить логи на ошибки
   - Убедиться, что новости парсятся корректно

---

## Часть 5: ОТЧЕТ

### 5.1 Диагноз: почему пост иногда в одном канале

**Корневая причина (конкретно):**

1. **Строки 190-215 в news-cron.js:**
   - Отправка во все каналы без проверки `topic.lang`
   - Если новость имеет `lang: "ru"`, она отправляется в EN и DE каналы
   - Если EN или DE канал не настроен или упал, `telegramPostedAt` все равно ставится

2. **Строка 218 в news-cron.js:**
   - `markTopicAsPosted(topic.id)` вызывается после `Promise.all(tasks)`
   - Не проверяется успешность отправки
   - Если все отправки упали, пост все равно помечается как отправленный

3. **Строки 190, 199, 208 в news-cron.js:**
   - Если `TELEGRAM_NEWS_CHAT_ID_*` пустой, задача не добавляется в `tasks[]`
   - Но `telegramPostedAt` ставится глобально
   - Результат: пост помечается как отправленный, хотя в канал не ушел

**Вывод:** Пост появляется только в одном канале, потому что:
- Новость отправляется во все каналы, но только один успевает отправиться
- Остальные каналы либо не настроены, либо падают с ошибкой
- `telegramPostedAt` ставится глобально, блокируя повторную попытку

### 5.2 Минимальный патч для news-cron.js

**Изменения:**
- ✅ Проверка `topic.lang` перед отправкой
- ✅ Отправка только в соответствующий канал
- ✅ Защита от пустых chat_id (WARN + пропуск без отметки)
- ✅ `telegramPostedAt` ставится только при успешной отправке

**Файл:** `netlify/functions/news-cron.js`  
**Строки:** 179-219 (заменены)

**Статус:** ✅ ИСПРАВЛЕНО

### 5.3 Минимальный патч для fetch-news.js

**Изменения:**
1. ✅ `MAX_NEW_ITEMS_PER_RUN = 5` (было 2)
2. ✅ Таймаут 15 секунд на RSS fetch (`AbortController`)
3. ✅ Фильтр свежести 48 часов (отбрасывание новостей без `pubDate` или старше 48ч)
4. ✅ Логирование статистики источников (OK/failed, items fetched)
5. ✅ Логирование отброшенных новостей (без даты / слишком старых)

**Файл:** `netlify/functions/fetch-news.js`  
**Строки:** 22-30, 192-203, 467-520 (изменены)

**Статус:** ✅ ИСПРАВЛЕНО

### 5.4 Рекомендации по источникам

**Текущее состояние:**
- RU: 3 источника
- EN: 3 источника
- DE: 2 источника (мало!)

**Рекомендуемые кандидаты:**
- EN: 8-12 источников (Reuters, AP, Politico, Financial Times, Bloomberg, Nature, Science, MIT Tech Review, Climate Home News, Inside Climate News)
- RU: 6-10 источников (RFE/RL, Current Time, Bellona, N+1, Хабр)
- DE: 6-10 источников (Spiegel, Süddeutsche, Die Zeit, Handelsblatt, Klimareporter, Spektrum, Golem)

**⚠️ ВАЖНО:** Все RSS URL нужно проверить перед добавлением (см. чек-лист в разделе 4.4).

**Где добавлять:** `netlify/functions/fetch-news.js`, массив `SOURCES` (строки 36-74)

**Формат:**
```javascript
{
  id: "unique_source_id",
  url: "https://...rss.xml",
  languages: ["en"], // или ["ru"], ["de"]
  // Опционально (для будущего):
  category: "politics", // "politics" | "economics" | "environment" | "science"
  priority: 1, // 1-5
}
```

### 5.5 План теста: как убедиться за 1 день, что RU/EN/DE стабильно получают посты

#### Шаг 1: Проверка конфигурации (5 минут)

1. Проверить переменные окружения:
   ```bash
   # Убедиться, что все три chat_id заданы:
   echo $TELEGRAM_NEWS_CHAT_ID_RU
   echo $TELEGRAM_NEWS_CHAT_ID_EN
   echo $TELEGRAM_NEWS_CHAT_ID_DE
   ```

2. Проверить, что в Firebase есть новости с разными `lang`:
   - Открыть Firebase Console → Realtime Database → `forum/topics`
   - Найти темы с `section: "news"`
   - Убедиться, что есть темы с `lang: "ru"`, `lang: "en"`, `lang: "de"`
   - Убедиться, что у них `telegramPostedAt: null` (не отправлены)

#### Шаг 2: Ручной запуск fetch-news.js (10 минут)

1. Запустить `fetch-news.js` вручную:
   ```bash
   curl "https://your-netlify-site.netlify.app/.netlify/functions/fetch-news?token=YOUR_SECRET"
   ```

2. Проверить ответ:
   ```json
   {
     "ok": true,
     "processed": 5,
     "titles": ["...", "..."]
   }
   ```

3. Проверить логи Netlify:
   - Должны быть строки: `[fetch-news] Sources: X OK, Y failed. Items fetched: Z`
   - Должны быть строки: `[fetch-news] Filtered out X items without valid pubDate`
   - Должны быть строки: `[fetch-news] Filtered out X items older than 48h`

4. Проверить Firebase:
   - Открыть `forum/topics`
   - Убедиться, что появились новые темы с `section: "news"`
   - Убедиться, что у них разные `lang` (ru/en/de)

#### Шаг 3: Ручной запуск news-cron.js (10 минут)

1. Запустить `news-cron.js` вручную:
   ```bash
   curl "https://your-netlify-site.netlify.app/.netlify/functions/news-cron?token=YOUR_SECRET"
   ```

2. Проверить ответ:
   ```json
   {
     "ok": true,
     "processed": 5,
     "totalSent": 5,
     "perLanguage": {
       "ru": { "sent": 2, "errors": [] },
       "en": { "sent": 2, "errors": [] },
       "de": { "sent": 1, "errors": [] }
     }
   }
   ```

3. Проверить Telegram-каналы:
   - Открыть RU канал → должны быть посты с `lang: "ru"`
   - Открыть EN канал → должны быть посты с `lang: "en"`
   - Открыть DE канал → должны быть посты с `lang: "de"`

4. Проверить логи Netlify:
   - Должны быть строки: `[news-cron] Topic X sent to ru/en/de`
   - НЕ должно быть строк: `WARN: Topic X skipped - no chat_id configured`

5. Проверить Firebase:
   - Открыть `forum/topics`
   - Убедиться, что у отправленных тем появилось `telegramPostedAt: <timestamp>`

#### Шаг 4: Проверка обработки ошибок (15 минут)

1. Временно отключить один chat_id (например, DE):
   ```bash
   # В Netlify Environment Variables:
   # TELEGRAM_NEWS_CHAT_ID_DE = "" (пустое значение)
   ```

2. Запустить `news-cron.js`:
   ```bash
   curl "https://your-netlify-site.netlify.app/.netlify/functions/news-cron?token=YOUR_SECRET"
   ```

3. Проверить логи:
   - Должна быть строка: `WARN: Topic X (lang=de) skipped - no chat_id configured`
   - НЕ должно быть строк: `Topic X NOT marked as posted` (для других языков)

4. Проверить Firebase:
   - Тема с `lang: "de"` НЕ должна иметь `telegramPostedAt`
   - Тема с `lang: "ru"` или `lang: "en"` должна иметь `telegramPostedAt` (если отправка успешна)

5. Включить chat_id обратно и повторить тест

#### Шаг 5: Мониторинг в течение дня (автоматически)

1. Настроить мониторинг логов Netlify:
   - Фильтр: `[news-cron]` или `[fetch-news]`
   - Уведомления при ошибках

2. Проверить каналы каждые 2-3 часа:
   - RU канал → должны появляться новые посты с `lang: "ru"`
   - EN канал → должны появляться новые посты с `lang: "en"`
   - DE канал → должны появляться новые посты с `lang: "de"`

3. Проверить статистику за день:
   ```bash
   # В логах Netlify найти все вызовы news-cron.js
   # Проверить perLanguage.sent для каждого языка
   # Должно быть примерно равномерное распределение
   ```

#### Шаг 6: Критерии успеха

✅ **Успех, если:**
- Все три канала получают посты в течение дня
- Посты соответствуют языку канала (RU канал → только `lang: "ru"`)
- Нет WARN о пропущенных темах из-за пустых chat_id
- `telegramPostedAt` ставится только при успешной отправке
- При ошибке отправки тема НЕ помечается как отправленная

❌ **Проблема, если:**
- Один или несколько каналов не получают посты
- Посты появляются в неправильных каналах (например, `lang: "ru"` в EN канале)
- Много WARN о пропущенных темах
- Тема помечается как отправленная, хотя отправка упала

---

## Итоговый чек-лист

- [x] ✅ Диагностика проблемы завершена
- [x] ✅ news-cron.js исправлен (языковая рассылка + корректная отметка)
- [x] ✅ fetch-news.js улучшен (таймауты, свежесть 48ч, увеличен лимит)
- [x] ✅ Рекомендации по источникам подготовлены
- [x] ✅ План теста составлен

**Статус:** ✅ ГОТОВО К ТЕСТИРОВАНИЮ
