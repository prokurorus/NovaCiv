# Рекомендации по расширению RSS источников

## Обзор

Текущий список источников (8 источников):
- **RU**: 3 источника (BBC Russian, DW Russian, Meduza)
- **EN**: 3 источника (BBC World, DW World, The Guardian)
- **DE**: 2 источника (Tagesschau, DW German)

**Цель:** Расширить до 12-15 источников на язык для стабильного ежечасного выпуска новостей.

---

## Кандидаты для добавления

### RU (Русский язык)

#### Политика

1. **Interfax**
   - URL: `https://www.interfax.ru/rss.asp`
   - Категория: politics
   - Примечание: Российское информационное агентство

2. **РБК**
   - URL: `https://www.rbc.ru/rss/main.xml`
   - Категория: politics, economics
   - Примечание: Российский деловой медиа

3. **Lenta.ru**
   - URL: `https://lenta.ru/rss`
   - Категория: politics, general
   - Примечание: Новостное агентство

4. **Газета.Ru**
   - URL: `https://www.gazeta.ru/export/rss/lenta.xml`
   - Категория: politics
   - Примечание: Новостной портал

#### Экономика

5. **Ведомости**
   - URL: `https://www.vedomosti.ru/rss/news`
   - Категория: economics
   - Примечание: Деловое издание

6. **Finam.ru**
   - URL: `https://www.finam.ru/analysis/news/rss`
   - Категория: economics, finance
   - Примечание: Финансовый портал

#### Экология

7. **Bellona (Russian)**
   - URL: `https://bellona.ru/feed`
   - Категория: environment
   - Примечание: Экологическая организация (проверить наличие RSS)

#### Наука и технологии

8. **N+1 (Russian)**
   - URL: `https://nplus1.ru/rss`
   - Категория: science-tech
   - Примечание: Научное издание

---

### EN (English)

#### Политика

1. **Reuters World News**
   - URL: `https://www.reutersagency.com/feed/?taxonomy=best-topics&post_type=best`
   - Или: `https://feeds.reuters.com/reuters/worldNews`
   - Категория: politics
   - Примечание: Международное агентство новостей

2. **Associated Press World**
   - URL: `https://feeds.apnews.com/rss/worldnews`
   - Категория: politics
   - Примечание: Международное агентство

3. **Financial Times World**
   - URL: `https://www.ft.com/world?format=rss`
   - Категория: politics, economics
   - Примечание: Британское деловое издание

4. **The Economist**
   - URL: `https://www.economist.com/world/rss.xml`
   - Категория: politics, economics
   - Примечание: Международное издание

#### Экономика

5. **Bloomberg Economics**
   - URL: `https://www.bloomberg.com/feeds/blinkx/economics.xml`
   - Категория: economics
   - Примечание: Финансовое издание

6. **MarketWatch**
   - URL: `https://feeds.marketwatch.com/marketwatch/realtimeheadlines/`
   - Категория: economics, finance
   - Примечание: Финансовые новости

#### Экология

7. **Climate Change News (Climate Home)**
   - URL: `https://www.climatechangenews.com/feed/`
   - Категория: environment
   - Примечание: Новости о климате

8. **Inside Climate News**
   - URL: `https://insideclimatenews.org/feed/`
   - Категория: environment
   - Примечание: Климатические новости

9. **Grist**
   - URL: `https://grist.org/feed/`
   - Категория: environment
   - Примечание: Экологические новости

#### Наука и технологии

10. **Science Daily**
    - URL: `https://www.sciencedaily.com/rss/all.xml`
    - Категория: science-tech
    - Примечание: Научные новости

11. **MIT Technology Review**
    - URL: `https://www.technologyreview.com/feed/`
    - Категория: science-tech
    - Примечание: Технологические новости

12. **Ars Technica**
    - URL: `https://feeds.arstechnica.com/arstechnica/index`
    - Категория: science-tech
    - Примечание: Технологические новости

---

### DE (Deutsch)

#### Политика

1. **Spiegel Politik**
   - URL: `https://www.spiegel.de/politik/index.rss`
   - Категория: politics
   - Примечание: Немецкое новостное издание

2. **Süddeutsche Zeitung Politik**
   - URL: `https://www.sueddeutsche.de/politik/rss`
   - Категория: politics
   - Примечание: Немецкое издание

3. **Die Zeit Politik**
   - URL: `https://www.zeit.de/politik/index/rss.xml`
   - Категория: politics
   - Примечание: Немецкое издание

4. **Frankfurter Allgemeine Politik**
   - URL: `https://www.faz.net/rss/aktuell/politik/`
   - Категория: politics
   - Примечание: Немецкое издание

#### Экономика

5. **Handelsblatt**
   - URL: `https://www.handelsblatt.com/contentexport/feed/top-themen`
   - Категория: economics
   - Примечание: Немецкое деловое издание

6. **WirtschaftsWoche**
   - URL: `https://www.wiwo.de/contentexport/feed/top-themen`
   - Категория: economics
   - Примечание: Немецкое деловое издание

#### Экология

7. **Klimareporter**
   - URL: `https://www.klimareporter.de/feed`
   - Категория: environment
   - Примечание: Климатические новости

8. **Deutsche Welle Umwelt**
   - URL: `https://rss.dw.com/rdf/rss-de-umwelt`
   - Категория: environment
   - Примечание: Окружающая среда

#### Наука и технологии

9. **Heise Online**
   - URL: `https://www.heise.de/rss/heise.rdf`
   - Категория: science-tech
   - Примечание: Технологические новости

10. **Golem.de**
    - URL: `https://rss.golem.de/rss.php?feed=ATOM1.0`
    - Категория: science-tech
    - Примечание: Технологические новости

---

## Процесс добавления

### Шаг 1: Проверка источников

Запустите скрипт проверки:

```bash
node scripts/check-rss-sources.mjs
```

### Шаг 2: Добавление в fetch-news.js

Откройте `netlify/functions/fetch-news.js` и добавьте источники в массив `SOURCES` (строки 36-82):

```javascript
const SOURCES = [
  // ... существующие источники ...

  // Новые источники
  {
    id: "reuters_world",
    url: "https://feeds.reuters.com/reuters/worldNews",
    languages: ["en"],
  },
  {
    id: "spiegel_politik",
    url: "https://www.spiegel.de/politik/index.rss",
    languages: ["de"],
  },
  // ... и т.д.
];
```

### Шаг 3: Тестирование

1. Проверьте RSS источники:
   ```bash
   node scripts/check-rss-sources.mjs
   ```

2. Проверьте pipeline:
   ```bash
   NEWS_BASE_URL=https://novaciv.space CRON_TOKEN=your_token node scripts/check-news-pipeline.mjs
   ```

3. Запустите fetch-news вручную (через Netlify dashboard или curl)

4. Проверьте, что новости появляются в Firebase

5. Запустите news-cron и проверьте отправку в Telegram

### Шаг 4: Мониторинг

После добавления источников отслеживайте:

- Количество обработанных новостей (`processed` в ответе fetch-news)
- Количество отправленных в Telegram (`totalSent` в ответе news-cron)
- Ошибки в логах Netlify Functions

---

## Рекомендации по добавлению

### Пакетное добавление

**Не добавляйте все источники сразу!** Добавляйте пакетами:

1. **Первая волна (3-5 источников на язык):**
   - RU: +2 источника (политика/экономика)
   - EN: +2 источника (политика/экономика)
   - DE: +3 источника (политика/экономика) — особенно важно, так как сейчас только 2 источника

2. **Вторая волна (через 1-2 дня):**
   - Добавить по 2-3 источника на язык (экология/наука)

3. **Третья волна (через неделю):**
   - Добавить остальные источники после мониторинга первых двух волн

### Приоритеты

**Высокий приоритет (добавить в первую очередь):**
- DE: Spiegel, Süddeutsche Zeitung, Die Zeit (3 источника)
- EN: Reuters, Associated Press (2 источника)
- RU: РБК, Lenta.ru (2 источника)

**Средний приоритет:**
- Экологические источники (по 1-2 на язык)
- Научно-технические источники (по 1-2 на язык)

**Низкий приоритет:**
- Дополнительные экономические источники (если экономики недостаточно)

---

## Отклонённые источники

Если источник не проходит проверку (`check-rss-sources.mjs`), добавьте его сюда с указанием причины:

### Пример

- `https://example.com/rss` — **ОТКЛОНЁН**: 404 Not Found
- `https://timeout.example.com/rss` — **ОТКЛОНЁН**: Timeout после 15s
- `https://not-rss.example.com/feed` — **ОТКЛОНЁН**: Не RSS формат (HTML)

---

## Итоговый баланс (после расширения)

**Целевое распределение:**
- **RU**: 12-15 источников (4-5 политика, 3-4 экономика, 2-3 экология, 2-3 наука)
- **EN**: 12-15 источников (4-5 политика, 3-4 экономика, 2-3 экология, 2-3 наука)
- **DE**: 12-15 источников (4-5 политика, 3-4 экономика, 2-3 экология, 2-3 наука)

**Текущий статус:**
- **RU**: 3 источника (3 политика)
- **EN**: 3 источника (3 политика)
- **DE**: 2 источника (2 политика)

**К добавлению:**
- **RU**: +9-12 источников
- **EN**: +9-12 источников
- **DE**: +10-13 источников
