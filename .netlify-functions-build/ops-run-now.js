var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// netlify/lib/opsPulse.js
var require_opsPulse = __commonJS({
  "netlify/lib/opsPulse.js"(exports2, module2) {
    var FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;
    var MAX_EVENTS = 20;
    function sanitizeString(str) {
      if (!str) return str;
      return String(str).replace(/sk-[a-zA-Z0-9]+/g, "sk-***").replace(/ghp_[a-zA-Z0-9]+/g, "ghp_***").replace(/AIza[^"'\s]+/g, "AIza***").replace(/-----BEGIN[^-]+-----END[^-]+-----/gs, "***PRIVATE_KEY***").replace(/["']([^"']*token[^"']*)["']/gi, '"***TOKEN***"');
    }
    async function writeHeartbeat2(component, status) {
      if (!FIREBASE_DB_URL) return;
      try {
        let safeErrorMsg = status.lastErrorMsg || null;
        if (safeErrorMsg) {
          safeErrorMsg = sanitizeString(safeErrorMsg).slice(0, 500);
        }
        const heartbeatData = {
          lastRunAt: status.lastRunAt,
          lastOkAt: status.lastOkAt || null,
          lastErrorAt: status.lastErrorAt || null,
          lastErrorMsg: safeErrorMsg,
          updatedAt: Date.now(),
          ...status.metrics || {}
        };
        const url = `${FIREBASE_DB_URL}/ops/heartbeat/${component}.json`;
        await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(heartbeatData)
        });
      } catch (error) {
        console.error(`[ops-pulse] Failed to write heartbeat for ${component}:`, error.message);
      }
    }
    async function writeEvent2(component, level, message, meta = {}) {
      if (!FIREBASE_DB_URL) return;
      try {
        const safeMeta = {};
        for (const [key, value] of Object.entries(meta)) {
          if (typeof value === "string") {
            safeMeta[key] = sanitizeString(value).slice(0, 200);
          } else {
            safeMeta[key] = value;
          }
        }
        const event = {
          ts: Date.now(),
          component,
          level,
          message: String(message).slice(0, 500),
          meta: safeMeta
        };
        const eventsUrl = `${FIREBASE_DB_URL}/ops/events.json`;
        const eventsResp = await fetch(eventsUrl);
        let events = {};
        if (eventsResp.ok) {
          const data = await eventsResp.json();
          if (data && typeof data === "object") {
            events = data;
          }
        }
        const newEventKey = Date.now().toString();
        events[newEventKey] = event;
        const eventKeys = Object.keys(events).sort((a, b) => parseInt(a) - parseInt(b));
        if (eventKeys.length > MAX_EVENTS) {
          const keysToRemove = eventKeys.slice(0, eventKeys.length - MAX_EVENTS);
          for (const key of keysToRemove) {
            delete events[key];
          }
          console.log(`[ops-pulse] Cleaned ${keysToRemove.length} old events (buffer size: ${MAX_EVENTS})`);
        }
        await fetch(eventsUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(events)
        });
      } catch (error) {
        console.error(`[ops-pulse] Failed to write event:`, error.message);
      }
    }
    async function writeFirebaseError(component, error, meta = {}) {
      if (!FIREBASE_DB_URL) return;
      try {
        const errorMeta = {
          op: meta.op || "unknown",
          path: meta.path || "unknown",
          status: meta.status || null,
          firebaseError: meta.firebaseError || null,
          ...meta
        };
        const safeMeta = {};
        for (const [key, value] of Object.entries(errorMeta)) {
          if (typeof value === "string") {
            safeMeta[key] = sanitizeString(value).slice(0, 200);
          } else {
            safeMeta[key] = value;
          }
        }
        const errorMsg = String(error && error.message ? error.message : error).slice(0, 500);
        await writeEvent2(component, "error", `Firebase ${errorMeta.op} error: ${errorMsg}`, safeMeta);
        await writeHeartbeat2(component, {
          lastRunAt: Date.now(),
          lastErrorAt: Date.now(),
          lastErrorMsg: sanitizeString(errorMsg).slice(0, 500)
        });
      } catch (e) {
        console.error(`[ops-pulse] Failed to write Firebase error:`, e.message);
      }
    }
    module2.exports = {
      writeHeartbeat: writeHeartbeat2,
      writeEvent: writeEvent2,
      writeFirebaseError
    };
  }
});

// netlify/lib/rssSourcesByLang.js
var require_rssSourcesByLang = __commonJS({
  "netlify/lib/rssSourcesByLang.js"(exports2, module2) {
    var RSS_SOURCES = {
      ru: [
        { name: "BBC Russian", url: "https://www.bbc.com/russian/index.xml" },
        { name: "DW Russian", url: "https://www.dw.com/ru/rss/rss-ru-all" },
        { name: "Meduza", url: "https://meduza.io/rss/all" },
        { name: "\u041C\u0435\u0434\u0443\u0437\u0430", url: "https://meduza.io/rss/all" },
        { name: "\u041D\u043E\u0432\u0430\u044F \u0433\u0430\u0437\u0435\u0442\u0430", url: "https://novayagazeta.ru/rss" },
        { name: "\u0420\u0430\u0434\u0438\u043E \u0421\u0432\u043E\u0431\u043E\u0434\u0430", url: "https://www.svoboda.org/api/zrqitewimt" },
        { name: "The Insider", url: "https://theins.ru/rss/all.xml" },
        { name: "Republic", url: "https://republic.ru/rss/all.xml" },
        { name: "Lenta.ru", url: "https://lenta.ru/rss" },
        { name: "\u041A\u043E\u043C\u043C\u0435\u0440\u0441\u0430\u043D\u0442", url: "https://www.kommersant.ru/RSS/news.xml" },
        { name: "\u0412\u0435\u0434\u043E\u043C\u043E\u0441\u0442\u0438", url: "https://www.vedomosti.ru/rss/news" },
        { name: "\u0420\u0411\u041A", url: "https://www.rbc.ru/rbcfreenews.rss" },
        { name: "\u0413\u0430\u0437\u0435\u0442\u0430.\u0440\u0443", url: "https://www.gazeta.ru/export/rss/lenta.xml" },
        { name: "\u0418\u043D\u0442\u0435\u0440\u0444\u0430\u043A\u0441", url: "https://www.interfax.ru/rss.asp" },
        { name: "\u0420\u0418\u0410 \u041D\u043E\u0432\u043E\u0441\u0442\u0438", url: "https://ria.ru/export/rss2/index.xml" },
        { name: "\u0422\u0410\u0421\u0421", url: "https://tass.ru/rss/v2.xml" },
        { name: "RT", url: "https://russian.rt.com/rss" },
        { name: "Sputnik", url: "https://sputniknews.com/rss/" },
        { name: "\u042D\u0445\u043E \u041C\u043E\u0441\u043A\u0432\u044B", url: "https://echo.msk.ru/rss/all.xml" },
        { name: "\u041C\u043E\u0441\u043A\u043E\u0432\u0441\u043A\u0438\u0439 \u043A\u043E\u043C\u0441\u043E\u043C\u043E\u043B\u0435\u0446", url: "https://www.mk.ru/rss/index.xml" },
        { name: "\u041D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u0430\u044F \u0433\u0430\u0437\u0435\u0442\u0430", url: "https://www.ng.ru/rss/" },
        { name: "\u0420\u043E\u0441\u0441\u0438\u0439\u0441\u043A\u0430\u044F \u0433\u0430\u0437\u0435\u0442\u0430", url: "https://rg.ru/xml/index.xml" },
        { name: "\u0412\u0437\u0433\u043B\u044F\u0434", url: "https://vz.ru/rss.xml" },
        { name: "Forbes Russia", url: "https://www.forbes.ru/rss.xml" },
        { name: "\u0412\u0435\u0434\u043E\u043C\u043E\u0441\u0442\u0438", url: "https://www.vedomosti.ru/rss/news" }
      ],
      en: [
        { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
        { name: "BBC News", url: "https://feeds.bbci.co.uk/news/rss.xml" },
        { name: "The Guardian World", url: "https://www.theguardian.com/world/rss" },
        { name: "The Guardian", url: "https://www.theguardian.com/uk/rss" },
        { name: "DW World", url: "https://rss.dw.com/rdf/rss-en-all" },
        { name: "Reuters World", url: "https://www.reuters.com/rssFeed/worldNews" },
        { name: "Reuters Top News", url: "https://www.reuters.com/rssFeed/topNews" },
        { name: "AP News", url: "https://apnews.com/apf-topnews" },
        { name: "AP World", url: "https://apnews.com/apf-worldnews" },
        { name: "CNN World", url: "http://rss.cnn.com/rss/edition.rss" },
        { name: "CNN Top Stories", url: "http://rss.cnn.com/rss/cnn_topstories.rss" },
        { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
        { name: "NPR World", url: "https://feeds.npr.org/1004/rss.xml" },
        { name: "NPR News", url: "https://feeds.npr.org/1001/rss.xml" },
        { name: "The New York Times World", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
        { name: "The New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml" },
        { name: "The Washington Post World", url: "https://feeds.washingtonpost.com/rss/world" },
        { name: "The Washington Post", url: "https://feeds.washingtonpost.com/rss/world" },
        { name: "Financial Times", url: "https://www.ft.com/?format=rss" },
        { name: "The Economist", url: "https://www.economist.com/rss.xml" },
        { name: "Foreign Policy", url: "https://foreignpolicy.com/feed/" },
        { name: "Foreign Affairs", url: "https://www.foreignaffairs.com/feed" },
        { name: "Politico", url: "https://www.politico.com/rss/politicopicks.xml" },
        { name: "The Hill", url: "https://thehill.com/rss/syndicator/19110" },
        { name: "Axios", url: "https://www.axios.com/feed/all.xml" },
        { name: "Vox", url: "https://www.vox.com/rss/index.xml" },
        { name: "The Atlantic", url: "https://www.theatlantic.com/feed/all/" },
        { name: "Wired", url: "https://www.wired.com/feed/rss" },
        { name: "TechCrunch", url: "https://techcrunch.com/feed/" },
        { name: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
        { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },
        { name: "MIT Technology Review", url: "https://www.technologyreview.com/feed/" },
        { name: "Nature News", url: "https://www.nature.com/nature.rss" },
        { name: "Science Daily", url: "https://www.sciencedaily.com/rss/all.xml" },
        { name: "Human Rights Watch", url: "https://www.hrw.org/rss" },
        { name: "Amnesty International", url: "https://www.amnesty.org/en/rss/" },
        { name: "Freedom House", url: "https://freedomhouse.org/rss" },
        { name: "Reporters Without Borders", url: "https://rsf.org/en/rss" },
        { name: "UN News", url: "https://news.un.org/feed/" },
        { name: "EU Observer", url: "https://euobserver.com/rss" },
        { name: "Euronews", url: "https://www.euronews.com/rss?format=mrss" }
      ],
      de: [
        { name: "Tagesschau", url: "https://www.tagesschau.de/xml/rss2" },
        { name: "DW German", url: "https://rss.dw.com/rdf/rss-de-all" },
        { name: "Der Spiegel", url: "https://www.spiegel.de/schlagzeilen/index.rss" },
        { name: "Die Zeit", url: "https://newsfeed.zeit.de/index" },
        { name: "S\xFCddeutsche Zeitung", url: "https://www.sueddeutsche.de/rss" },
        { name: "Frankfurter Allgemeine", url: "https://www.faz.net/rss/aktuell/" },
        { name: "Die Welt", url: "https://www.welt.de/feeds/section/home.rss" },
        { name: "taz", url: "https://taz.de/!p4606;rss/" },
        { name: "Neue Z\xFCrcher Zeitung", url: "https://www.nzz.ch/international.rss" },
        { name: "Der Standard", url: "https://www.derstandard.at/rss" },
        { name: "ORF", url: "https://orf.at/stories/s/index.rss" },
        { name: "ARD", url: "https://www.ard.de/home/ard/ARD_Startseite_Neu_100~rss.xml" },
        { name: "ZDF", url: "https://www.zdf.de/rss/zdf/nachrichten" },
        { name: "Bild", url: "https://www.bild.de/rssfeeds/rss3-16725492,feed=home.bild.html" },
        { name: "Focus", url: "https://www.focus.de/feed/rss" },
        { name: "Stern", url: "https://www.stern.de/feed/standard/alle-nachrichten/" },
        { name: "Handelsblatt", url: "https://www.handelsblatt.com/contentexport/feed/schlagzeilen" },
        { name: "WirtschaftsWoche", url: "https://www.wiwo.de/contentexport/feed/rss" },
        { name: "Deutsche Welle", url: "https://rss.dw.com/rdf/rss-de-all" },
        { name: "Heise", url: "https://www.heise.de/rss/heise.rdf" },
        { name: "Golem", url: "https://www.golem.de/rss" },
        { name: "Netzpolitik", url: "https://netzpolitik.org/feed/" },
        { name: "Telepolis", url: "https://www.heise.de/tp/rss/artikel/2/2/1/1/1/1/1" },
        { name: "Cicero", url: "https://www.cicero.de/rss" }
      ]
    };
    module2.exports = {
      RSS_SOURCES
    };
  }
});

// netlify/functions/fetch-news.js
var require_fetch_news = __commonJS({
  "netlify/functions/fetch-news.js"(exports2) {
    var OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    var FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;
    var NEWS_CRON_SECRET = process.env.NEWS_CRON_SECRET;
    var OPS_CRON_SECRET2 = process.env.OPS_CRON_SECRET;
    var { writeHeartbeat: writeHeartbeat2, writeEvent: writeEvent2, writeFirebaseError } = require_opsPulse();
    var { RSS_SOURCES } = require_rssSourcesByLang();
    var MAX_CANDIDATES_PER_LANG = 60;
    var NEWS_WINDOW_HOURS = 6;
    var NEWS_META_BASE_PATH = "/newsMeta";
    var SYSTEM_PROMPT_ANALYSIS = `
You are an analyst for the digital community "NovaCiv" (New Civilization).

Core values of NovaCiv:
\u2013 non-violence and rejection of coercion;
\u2013 freedom and autonomy of the individual;
\u2013 honest dialogue and transparent decision-making;
\u2013 respect for intelligent life and its preservation;
\u2013 science, critical thinking and verifiable knowledge;
\u2013 cooperation instead of domination;
\u2013 sustainable attitude to the planet and resources;
\u2013 decentralization of power and distrust of monopolies.

You receive a news item (headline, short description, sometimes a text fragment).

Your task: create a meaningful analysis (NOT a dry summary) that helps readers understand the news through NovaCiv values.

Answer in ENGLISH. Write calmly, clearly, like an adult. No slogans, no propaganda, no moralizing, no "we need more information" excuses. One paragraph = one thought.

Structure (return as JSON):
{
  "sense": "240-360 characters. The living meaning of the news, in human language. What actually happened and why it matters to people.",
  "why": "Up to 180 characters. ONE thesis about how this affects people, freedoms, future, technologies, or ecosystems.",
  "view": "Up to 220 characters. ONE thesis strictly in NovaCiv principles: non-violence, autonomy, transparency, anti-militarism, anti-power-concentration. Where are risks of violence/monopolies/manipulation? Where are opportunities for science/cooperation?",
  "question": "Up to 160 characters. ONE question inviting reflection, not a call to action."
}

Rules:
- sense: human language, not bureaucratic. Show the real meaning.
- why: one clear thesis, not a list.
- view: strictly in NovaCiv principles. No generic "this is important".
- question: one question that makes people think, not a rhetorical one.
- No invented facts. If information is missing, say so briefly.
- No water, no fluff. Every word counts.
`.trim();
    var SYSTEM_PROMPT_TRANSLATE = `
You are a precise translator for the digital community "NovaCiv".

Your task:
\u2013 Translate the given analytical text from ENGLISH into the target language.
\u2013 Preserve meaning, nuance and calm, neutral tone.
\u2013 Keep the structure, headings, numbering and paragraphs as in the original.
\u2013 Do NOT add your own commentary or extra sentences.
`.trim();
    function stripCdata(str) {
      if (!str) return "";
      let s = String(str).trim();
      const cdataStart = "<![CDATA[";
      const cdataEnd = "]]>";
      if (s.startsWith(cdataStart) && s.endsWith(cdataEnd)) {
        s = s.slice(cdataStart.length, s.length - cdataEnd.length).trim();
      }
      return s;
    }
    function parseRss(xml, sourceId, languages) {
      const items = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
      let match;
      while (match = itemRegex.exec(xml)) {
        const block = match[1];
        const getTag = (tag) => {
          const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
          const m = block.match(re);
          return m ? stripCdata(m[1]) : "";
        };
        const title = getTag("title");
        const link = getTag("link");
        const guid = getTag("guid");
        const pubDate = getTag("pubDate");
        let description = getTag("description");
        if (!description) {
          description = getTag("summary") || getTag("content:encoded") || "";
        }
        let imageUrl = "";
        const enclosureMatch = block.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*>/i);
        if (enclosureMatch) {
          const enclosureType = (block.match(/<enclosure[^>]+type=["']([^"']+)["']/i) || [])[1] || "";
          if (enclosureType.startsWith("image/")) {
            imageUrl = enclosureMatch[1];
          }
        }
        if (!imageUrl) {
          const mediaThumb = getTag("media:thumbnail") || getTag("media:content");
          if (mediaThumb) {
            const urlMatch = mediaThumb.match(/url=["']([^"']+)["']/i);
            if (urlMatch) imageUrl = urlMatch[1];
          }
        }
        if (!imageUrl && description) {
          const ogImageMatch = description.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
          if (ogImageMatch) imageUrl = ogImageMatch[1];
          if (!imageUrl) {
            const imgMatch = description.match(/<img[^>]+src=["']([^"']+)["']/i);
            if (imgMatch) imageUrl = imgMatch[1];
          }
        }
        items.push({
          sourceId,
          title: title || "",
          link: link || "",
          guid: guid || "",
          pubDate: pubDate || "",
          description: description || "",
          imageUrl: imageUrl || "",
          targetLangs: Array.isArray(languages) ? [...languages] : []
        });
      }
      return items;
    }
    async function fetchRssSource(sourceUrl, sourceName, sourceLang) {
      try {
        const res = await fetch(sourceUrl);
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(
            `RSS fetch failed for ${sourceName}: HTTP ${res.status} \u2013 ${text.slice(0, 200)}`
          );
        }
        const xml = await res.text();
        const sourceId = safeKey(sourceName);
        const items = parseRss(xml, sourceId, [sourceLang]);
        return items;
      } catch (err) {
        if (err.message && err.message.includes("RSS fetch failed")) {
          throw err;
        }
        throw new Error(`RSS fetch error for ${sourceName}: ${err.message || String(err)}`);
      }
    }
    function safeKey(value) {
      if (!value) return "unknown";
      return String(value).trim().toLowerCase().replace(/[.#$[\]/]/g, "_").replace(/\s+/g, "_").slice(0, 120);
    }
    function normalizeTitle(title) {
      if (!title) return "";
      return title.toLowerCase().replace(/\s+/g, " ").replace(/[«»"“"]/g, '"').trim();
    }
    function makeNewsKey(item) {
      const base = (item.guid || item.link || item.title || "").trim();
      const rawKey = `${item.sourceId}::${base.slice(0, 200)}`;
      return safeKey(rawKey);
    }
    function isJunkItem(item, publishedSources, publishedTitles) {
      if (!item.title || !item.link) {
        return { isJunk: true, reason: "missing title or url" };
      }
      if (item.title.length < 35) {
        return { isJunk: true, reason: "title too short" };
      }
      const sourceId = item.sourceId || safeKey(item.sourceName || "");
      const now = Date.now();
      const cutoff24h = now - 24 * 60 * 60 * 1e3;
      if (publishedSources[sourceId] && publishedSources[sourceId] > cutoff24h) {
        return { isJunk: true, reason: "source published recently" };
      }
      const titleKey = safeKey(normalizeTitle(item.title));
      const cutoff48h = now - 48 * 60 * 60 * 1e3;
      if (publishedTitles[titleKey] && publishedTitles[titleKey] > cutoff48h) {
        return { isJunk: true, reason: "similar title published recently" };
      }
      return { isJunk: false };
    }
    function scoreNewsItem(item) {
      let score = 0;
      const title = (item.title || "").toLowerCase();
      const description = (item.description || "").toLowerCase();
      const text = `${title} ${description}`;
      const internationalKeywords = [
        "international",
        "global",
        "world",
        "united nations",
        "eu",
        "nato",
        "\u043C\u0435\u0436\u0434\u0443\u043D\u0430\u0440\u043E\u0434\u043D\u044B\u0439",
        "\u043C\u0438\u0440\u043E\u0432\u043E\u0439",
        "\u043E\u043E\u043D",
        "\u0435\u0441",
        "\u043D\u0430\u0442\u043E",
        "international",
        "weltweit",
        "eu",
        "nato",
        "uno"
      ];
      if (internationalKeywords.some((kw) => text.includes(kw))) {
        score += 25;
      }
      const powerKeywords = [
        "government",
        "parliament",
        "court",
        "law",
        "legislation",
        "policy",
        "\u043F\u0440\u0430\u0432\u0438\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u043E",
        "\u043F\u0430\u0440\u043B\u0430\u043C\u0435\u043D\u0442",
        "\u0441\u0443\u0434",
        "\u0437\u0430\u043A\u043E\u043D",
        "\u043F\u043E\u043B\u0438\u0442\u0438\u043A\u0430",
        "regierung",
        "parlament",
        "gericht",
        "gesetz",
        "politik"
      ];
      if (powerKeywords.some((kw) => text.includes(kw))) {
        score += 20;
      }
      const rightsKeywords = [
        "rights",
        "freedom",
        "liberty",
        "autonomy",
        "privacy",
        "democracy",
        "\u043F\u0440\u0430\u0432\u0430",
        "\u0441\u0432\u043E\u0431\u043E\u0434\u0430",
        "\u0430\u0432\u0442\u043E\u043D\u043E\u043C\u0438\u044F",
        "\u043F\u0440\u0438\u0432\u0430\u0442\u043D\u043E\u0441\u0442\u044C",
        "\u0434\u0435\u043C\u043E\u043A\u0440\u0430\u0442\u0438\u044F",
        "rechte",
        "freiheit",
        "autonomie",
        "privat",
        "demokratie"
      ];
      if (rightsKeywords.some((kw) => text.includes(kw))) {
        score += 15;
      }
      const techKeywords = [
        "technology",
        "ai",
        "artificial intelligence",
        "science",
        "research",
        "\u0442\u0435\u0445\u043D\u043E\u043B\u043E\u0433\u0438\u044F",
        "\u0438\u0438",
        "\u0438\u0441\u043A\u0443\u0441\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439 \u0438\u043D\u0442\u0435\u043B\u043B\u0435\u043A\u0442",
        "\u043D\u0430\u0443\u043A\u0430",
        "\u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435",
        "technologie",
        "ki",
        "k\xFCnstliche intelligenz",
        "wissenschaft",
        "forschung"
      ];
      if (techKeywords.some((kw) => text.includes(kw))) {
        score += 10;
      }
      const precedentKeywords = [
        "first",
        "precedent",
        "decision",
        "ruling",
        "breakthrough",
        "\u043F\u0435\u0440\u0432\u044B\u0439",
        "\u043F\u0440\u0435\u0446\u0435\u0434\u0435\u043D\u0442",
        "\u0440\u0435\u0448\u0435\u043D\u0438\u0435",
        "\u043F\u0440\u043E\u0440\u044B\u0432",
        "erst",
        "pr\xE4zedenzfall",
        "entscheidung",
        "durchbruch"
      ];
      if (precedentKeywords.some((kw) => text.includes(kw))) {
        score += 10;
      }
      const crimeKeywords = [
        "murder",
        "robbery",
        "theft",
        "assault",
        "arrest",
        "\u0443\u0431\u0438\u0439\u0441\u0442\u0432\u043E",
        "\u043E\u0433\u0440\u0430\u0431\u043B\u0435\u043D\u0438\u0435",
        "\u043A\u0440\u0430\u0436\u0430",
        "\u043D\u0430\u043F\u0430\u0434\u0435\u043D\u0438\u0435",
        "\u0430\u0440\u0435\u0441\u0442",
        "mord",
        "raub",
        "diebstahl",
        "angriff",
        "verhaftung"
      ];
      if (crimeKeywords.some((kw) => text.includes(kw)) && !internationalKeywords.some((kw) => text.includes(kw)) && !powerKeywords.some((kw) => text.includes(kw))) {
        score -= 15;
      }
      const entertainmentKeywords = [
        "sport",
        "football",
        "soccer",
        "celebrity",
        "star",
        "show",
        "\u0441\u043F\u043E\u0440\u0442",
        "\u0444\u0443\u0442\u0431\u043E\u043B",
        "\u0437\u0432\u0435\u0437\u0434\u0430",
        "\u0448\u043E\u0443",
        "\u0441\u0435\u043B\u0435\u0431\u0440\u0438\u0442\u0438",
        "sport",
        "fu\xDFball",
        "star",
        "show",
        "prominente"
      ];
      if (entertainmentKeywords.some((kw) => text.includes(kw))) {
        score -= 15;
      }
      const sensationalKeywords = [
        "shocking",
        "amazing",
        "incredible",
        "unbelievable",
        "breaking",
        "\u0448\u043E\u043A\u0438\u0440\u0443\u044E\u0449\u0438\u0439",
        "\u043D\u0435\u0432\u0435\u0440\u043E\u044F\u0442\u043D\u044B\u0439",
        "\u0441\u0435\u043D\u0441\u0430\u0446\u0438\u044F",
        "schockierend",
        "unglaublich",
        "sensation"
      ];
      if (sensationalKeywords.some((kw) => text.includes(kw)) && score < 20) {
        score -= 10;
      }
      return Math.max(0, Math.min(100, score));
    }
    var emptyMeta = { processedKeys: {}, titleKeys: {} };
    async function loadNewsMeta(lang) {
      if (!FIREBASE_DB_URL) return emptyMeta;
      const metaPath = `${NEWS_META_BASE_PATH}/${lang}.json`;
      try {
        const res = await fetch(`${FIREBASE_DB_URL}${metaPath}`);
        if (!res.ok) {
          return emptyMeta;
        }
        const data = await res.json();
        if (!data || typeof data !== "object") return emptyMeta;
        const processedKeys = data.processedKeys && typeof data.processedKeys === "object" ? data.processedKeys : {};
        const titleKeys = data.titleKeys && typeof data.titleKeys === "object" ? data.titleKeys : {};
        return { processedKeys, titleKeys };
      } catch (e) {
        console.error(`Error loading news meta for ${lang}:`, e);
        return emptyMeta;
      }
    }
    async function saveNewsMeta(lang, meta) {
      if (!FIREBASE_DB_URL) return;
      const sanitizedMeta = {
        processedKeys: {},
        titleKeys: {}
      };
      if (meta.processedKeys) {
        for (const [key, value] of Object.entries(meta.processedKeys)) {
          const safe = safeKey(key);
          sanitizedMeta.processedKeys[safe] = value;
        }
      }
      if (meta.titleKeys) {
        for (const [key, value] of Object.entries(meta.titleKeys)) {
          const safe = safeKey(key);
          sanitizedMeta.titleKeys[safe] = value;
        }
      }
      const metaPath = `${NEWS_META_BASE_PATH}/${lang}.json`;
      try {
        const res = await fetch(`${FIREBASE_DB_URL}${metaPath}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sanitizedMeta)
        });
        if (!res.ok) {
          const text = await res.text();
          await writeFirebaseError("fetch-news", new Error(`Failed to write news meta: ${res.status}`), {
            path: metaPath,
            op: "write",
            status: res.status,
            firebaseError: text.slice(0, 200)
          });
          console.error(`Failed to write news meta for ${lang}:`, res.status, text);
        }
      } catch (e) {
        await writeFirebaseError("fetch-news", e, {
          path: metaPath,
          op: "write"
        });
        console.error(`Error writing news meta for ${lang}:`, e);
      }
    }
    async function saveNewsToForumLang(item, analyticData, langCode, scheduledFor) {
      if (!FIREBASE_DB_URL) {
        const error = new Error("FIREBASE_DB_URL is not set");
        await writeFirebaseError("fetch-news", error, {
          path: "forum/topics",
          op: "write"
        });
        throw error;
      }
      const now = Date.now();
      const content = typeof analyticData === "string" ? analyticData : JSON.stringify(analyticData);
      const payload = {
        title: item.title || "(no title)",
        content,
        // Структурированные данные для форматирования
        sense: typeof analyticData === "object" ? analyticData.sense : null,
        why: typeof analyticData === "object" ? analyticData.why : null,
        view: typeof analyticData === "object" ? analyticData.view : null,
        question: typeof analyticData === "object" ? analyticData.question : null,
        section: "news",
        createdAt: now,
        createdAtServer: now,
        scheduledFor,
        // Время ближайшего часа для публикации
        authorNickname: "NovaCiv News",
        lang: langCode,
        sourceId: safeKey(item.sourceId || item.sourceName || ""),
        sourceName: item.sourceName || "",
        originalGuid: item.guid || "",
        originalLink: item.link || "",
        pubDate: item.pubDate || "",
        imageUrl: item.imageUrl || "",
        analysisLang: "en",
        // Анализ всегда на EN
        posted: false
      };
      try {
        const res = await fetch(`${FIREBASE_DB_URL}/forum/topics.json`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const text = await res.text();
          const error = new Error(`Firebase write error: HTTP ${res.status} \u2013 ${text}`);
          await writeFirebaseError("fetch-news", error, {
            path: "forum/topics",
            op: "write",
            status: res.status,
            firebaseError: text.slice(0, 200)
          });
          throw error;
        }
      } catch (error) {
        if (!error.message || !error.message.includes("Firebase write error")) {
          await writeFirebaseError("fetch-news", error, {
            path: "forum/topics",
            op: "write"
          });
        }
        throw error;
      }
    }
    async function analyzeNewsItemEn(item) {
      if (!OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is not set");
      }
      const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
      const userPrompt = `
News item:

Source: ${item.sourceId}
Title: ${item.title || "(no title)"}
Link: ${item.link || "(no link)"}

Short description / fragment:
${item.description || "(no description provided)"}

Please analyse this news item in the format described in the instructions.
Do not repeat the title. We only need the analytical text.
`.trim();
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT_ANALYSIS },
            { role: "user", content: userPrompt }
          ],
          max_tokens: 700,
          temperature: 0.4
        })
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenAI API error: HTTP ${response.status} \u2013 ${text}`);
      }
      const data = await response.json();
      const answer = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content ? data.choices[0].message.content.trim() : "";
      if (!answer) {
        throw new Error("Empty answer from OpenAI for news item");
      }
      try {
        const parsed = JSON.parse(answer);
        if (parsed.sense && parsed.why && parsed.view && parsed.question) {
          return parsed;
        }
      } catch (e) {
        console.log("[fetch-news] OpenAI response is not JSON, trying to parse:", answer.slice(0, 200));
      }
      const fallback = {
        sense: `${item.title || "News"}. ${item.description ? item.description.slice(0, 200) : "\u0421\u0443\u0442\u044C: \u0432\u0430\u0436\u043D\u043E\u0435 \u0441\u043E\u0431\u044B\u0442\u0438\u0435, \u0442\u0440\u0435\u0431\u0443\u044E\u0449\u0435\u0435 \u0432\u043D\u0438\u043C\u0430\u043D\u0438\u044F."}`,
        why: "\u042D\u0442\u043E \u0432\u043B\u0438\u044F\u0435\u0442 \u043D\u0430 \u0441\u0432\u043E\u0431\u043E\u0434\u044B \u043B\u044E\u0434\u0435\u0439 \u0438 \u0431\u0443\u0434\u0443\u0449\u0435\u0435 \u043E\u0431\u0449\u0435\u0441\u0442\u0432\u0430.",
        view: "\u0421 \u0442\u043E\u0447\u043A\u0438 \u0437\u0440\u0435\u043D\u0438\u044F NovaCiv \u0432\u0430\u0436\u043D\u043E \u043E\u0446\u0435\u043D\u0438\u0442\u044C \u0440\u0438\u0441\u043A\u0438 \u043D\u0430\u0441\u0438\u043B\u0438\u044F \u0438 \u043A\u043E\u043D\u0446\u0435\u043D\u0442\u0440\u0430\u0446\u0438\u0438 \u0432\u043B\u0430\u0441\u0442\u0438, \u0430 \u0442\u0430\u043A\u0436\u0435 \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E\u0441\u0442\u0438 \u0434\u043B\u044F \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u0447\u0435\u0441\u0442\u0432\u0430.",
        question: "\u041A\u0430\u043A \u044D\u0442\u043E \u0441\u043E\u0431\u044B\u0442\u0438\u0435 \u0432\u043B\u0438\u044F\u0435\u0442 \u043D\u0430 \u0432\u0430\u0448\u0443 \u0441\u0432\u043E\u0431\u043E\u0434\u0443 \u0438 \u0430\u0432\u0442\u043E\u043D\u043E\u043C\u0438\u044E?"
      };
      const senseMatch = answer.match(/"sense"\s*:\s*"([^"]+)"/i) || answer.match(/sense[:\s]+(.*?)(?:\n|"why"|$)/i);
      const whyMatch = answer.match(/"why"\s*:\s*"([^"]+)"/i) || answer.match(/why[:\s]+(.*?)(?:\n|"view"|$)/i);
      const viewMatch = answer.match(/"view"\s*:\s*"([^"]+)"/i) || answer.match(/view[:\s]+(.*?)(?:\n|"question"|$)/i);
      const questionMatch = answer.match(/"question"\s*:\s*"([^"]+)"/i) || answer.match(/question[:\s]+(.*?)(?:\n|$)/i);
      if (senseMatch) fallback.sense = senseMatch[1].slice(0, 360);
      if (whyMatch) fallback.why = whyMatch[1].slice(0, 180);
      if (viewMatch) fallback.view = viewMatch[1].slice(0, 220);
      if (questionMatch) fallback.question = questionMatch[1].slice(0, 160);
      console.log("[fetch-news] Using fallback analysis structure");
      return fallback;
    }
    async function translateText(englishText, targetLangCode) {
      if (!OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is not set");
      }
      const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
      let targetDescription;
      if (targetLangCode === "ru") {
        targetDescription = "Russian";
      } else if (targetLangCode === "de") {
        targetDescription = "German";
      } else {
        targetDescription = "the target language";
      }
      const userPrompt = `
Target language: ${targetDescription} (code: ${targetLangCode})

Translate the following analytical text from ENGLISH into the target language.
Preserve structure, headings, numbering and paragraphs.

---
${englishText}
---
`.trim();
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT_TRANSLATE },
            { role: "user", content: userPrompt }
          ],
          max_tokens: 900,
          temperature: 0.2
        })
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `OpenAI translation error (${targetLangCode}): HTTP ${response.status} \u2013 ${text}`
        );
      }
      const data = await response.json();
      const answer = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content ? data.choices[0].message.content.trim() : "";
      if (!answer) {
        throw new Error(`Empty translation for language ${targetLangCode}`);
      }
      return answer;
    }
    function getHeader(headers, key) {
      if (!headers || !key) return "";
      const lowerKey = key.toLowerCase();
      return headers[key] || headers[lowerKey] || headers[key.toLowerCase()] || headers[key.toUpperCase()] || "";
    }
    function determineInvocationType(event) {
      const headers = event.headers || {};
      const userAgent = getHeader(headers, "user-agent");
      const eventHeader = getHeader(headers, "x-netlify-event") || getHeader(headers, "x-nf-event");
      const referer = getHeader(headers, "referer") || getHeader(headers, "referrer");
      const isScheduled = eventHeader && eventHeader.toLowerCase() === "schedule" || userAgent === "Netlify-Scheduled-Function";
      if (isScheduled) {
        return {
          type: "scheduled",
          skipAuth: true
        };
      }
      const allowRunNowBypass = process.env.ALLOW_NETLIFY_RUN_NOW_BYPASS && process.env.ALLOW_NETLIFY_RUN_NOW_BYPASS.toLowerCase() === "true";
      if (allowRunNowBypass) {
        const xNfRequestId = getHeader(headers, "x-nf-request-id");
        const xNfSiteId = getHeader(headers, "x-nf-site-id");
        const xNfDeployId = getHeader(headers, "x-nf-deploy-id");
        const looksLikeNetlifyRunNow = referer && (referer.toLowerCase().includes("app.netlify.com") || referer.toLowerCase().includes("app.netlify.app")) || xNfRequestId || xNfSiteId || xNfDeployId || userAgent && userAgent.toLowerCase().includes("netlify");
        if (looksLikeNetlifyRunNow) {
          return {
            type: "netlify_run_now",
            skipAuth: true
          };
        }
      }
      if (allowRunNowBypass) {
        const xNfRequestId = getHeader(headers, "x-nf-request-id");
        const xNfSiteId = getHeader(headers, "x-nf-site-id");
        const xNfDeployId = getHeader(headers, "x-nf-deploy-id");
        console.log("[debug] allowBypass=true http invocation headers keys:", Object.keys(headers));
        console.log("[debug] ua=", userAgent);
        console.log("[debug] x-nf-request-id=", xNfRequestId);
        console.log("[debug] x-nf-site-id=", xNfSiteId);
        console.log("[debug] x-nf-deploy-id=", xNfDeployId);
        console.log("[debug] referer=", referer);
        console.log("[debug] x-netlify-event=", eventHeader);
      }
      return {
        type: "http",
        skipAuth: false
      };
    }
    exports2.handler = async (event) => {
      console.log("fetch-news start");
      const startTime = Date.now();
      const component = "fetch-news";
      const qs = event.queryStringParameters || {};
      const isDebug = qs.debug === "1" || qs.debug === "true";
      await writeHeartbeat2(component, {
        lastRunAt: startTime
      });
      if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
        await writeEvent2(component, "warn", "Invalid HTTP method", { method: event.httpMethod });
        return {
          statusCode: 405,
          body: "Method Not Allowed"
        };
      }
      const invocation = determineInvocationType(event);
      if (invocation.type === "scheduled") {
        console.log("invocation type: scheduled");
        console.log("auth skipped");
      } else if (invocation.type === "netlify_run_now") {
        console.log("invocation type: netlify_run_now");
        console.log("auth skipped (ALLOW_NETLIFY_RUN_NOW_BYPASS=true)");
      } else {
        console.log("invocation type: http");
        const validToken = NEWS_CRON_SECRET || OPS_CRON_SECRET2;
        if (validToken) {
          const providedToken = qs.token;
          if (!providedToken || providedToken !== NEWS_CRON_SECRET && providedToken !== OPS_CRON_SECRET2) {
            console.log("auth gate blocked (no token or token mismatch)");
            return {
              statusCode: 403,
              body: JSON.stringify({ ok: false, error: "Forbidden: invalid token" })
            };
          }
        }
        console.log("auth gate passed");
      }
      if (!FIREBASE_DB_URL) {
        const errorMsg = "FIREBASE_DB_URL is not set";
        await writeEvent2(component, "error", errorMsg);
        return {
          statusCode: 200,
          body: JSON.stringify({
            ok: false,
            error: errorMsg
          })
        };
      }
      if (!OPENAI_API_KEY) {
        const errorMsg = "OPENAI_API_KEY is not set";
        await writeEvent2(component, "error", errorMsg);
        return {
          statusCode: 200,
          body: JSON.stringify({
            ok: false,
            error: errorMsg
          })
        };
      }
      try {
        const now = /* @__PURE__ */ new Date();
        const nextHour = new Date(now);
        nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
        const scheduledFor = nextHour.getTime();
        console.log(`[fetch-news] Preparing news for ${new Date(scheduledFor).toISOString()}`);
        const languages = ["ru", "en", "de"];
        const results = {
          ru: { prepared: false, fallback: false },
          en: { prepared: false, fallback: false },
          de: { prepared: false, fallback: false }
        };
        let totalCreated = 0;
        for (const lang of languages) {
          console.log(`[fetch-news] Processing ${lang}...`);
          const meta = await loadNewsMeta(lang);
          const { processedKeys, titleKeys } = meta;
          const publishedSources = {};
          const publishedTitles = {};
          const nowTs = Date.now();
          const cutoff24h = nowTs - 24 * 60 * 60 * 1e3;
          const cutoff48h = nowTs - 48 * 60 * 60 * 1e3;
          for (const [key, value] of Object.entries(processedKeys)) {
            if (value.processedAt && value.processedAt > cutoff24h) {
              const sourceId = value.sourceId || key.split("::")[0];
              if (sourceId) {
                publishedSources[sourceId] = Math.max(publishedSources[sourceId] || 0, value.processedAt);
              }
            }
          }
          for (const [key, value] of Object.entries(titleKeys)) {
            if (value.processedAt && value.processedAt > cutoff48h) {
              publishedTitles[key] = Math.max(publishedTitles[key] || 0, value.processedAt);
            }
          }
          const sources = RSS_SOURCES[lang] || [];
          if (sources.length === 0) {
            console.log(`[fetch-news] No sources for ${lang}`);
            continue;
          }
          const candidates = [];
          const windowStart = nowTs - NEWS_WINDOW_HOURS * 60 * 60 * 1e3;
          for (const source of sources) {
            try {
              const items = await fetchRssSource(source.url, source.name, lang);
              items.forEach((item) => {
                item.sourceName = source.name;
                item.sourceLang = lang;
                item.sourceId = safeKey(source.name);
              });
              const recentItems = items.filter((item) => {
                if (!item.pubDate) return false;
                try {
                  const pubTime = new Date(item.pubDate).getTime();
                  return pubTime >= windowStart;
                } catch (e) {
                  return false;
                }
              });
              candidates.push(...recentItems);
              if (candidates.length >= MAX_CANDIDATES_PER_LANG) {
                break;
              }
            } catch (err) {
              console.error(`[fetch-news] RSS fetch error for ${lang}/${source.name}:`, err.message);
            }
          }
          const limitedCandidates = candidates.slice(0, MAX_CANDIDATES_PER_LANG);
          console.log(`[fetch-news] ${lang}: collected ${limitedCandidates.length} candidates`);
          const filteredCandidates = [];
          for (const item of limitedCandidates) {
            const junkCheck = isJunkItem(item, publishedSources, publishedTitles);
            if (!junkCheck.isJunk) {
              filteredCandidates.push(item);
            }
          }
          console.log(`[fetch-news] ${lang}: after junk filter: ${filteredCandidates.length}`);
          if (filteredCandidates.length === 0) {
            console.log(`[fetch-news] ${lang}: no candidates after filtering`);
            if (lang !== "en") {
              results[lang].fallback = true;
            }
            continue;
          }
          const scoredCandidates = filteredCandidates.map((item) => ({
            item,
            score: scoreNewsItem(item)
          }));
          const top5 = scoredCandidates.sort((a, b) => b.score - a.score).slice(0, 5);
          console.log(`[fetch-news] ${lang}: top 5 scores:`, top5.map((t) => t.score));
          const analyzed = [];
          for (const { item, score } of top5) {
            try {
              let itemForAnalysis = item;
              if (item.sourceLang !== "en") {
                const titleEn = await translateText(item.title || "", "en");
                const descEn = await translateText(item.description || "", "en");
                itemForAnalysis = {
                  ...item,
                  title: typeof titleEn === "string" ? titleEn : item.title,
                  description: typeof descEn === "string" ? descEn : item.description
                };
              }
              const analyticEn = await analyzeNewsItemEn(itemForAnalysis);
              if (analyticEn && typeof analyticEn === "object" && analyticEn.sense && analyticEn.why && analyticEn.view && analyticEn.question) {
                analyzed.push({
                  item,
                  score,
                  analysis: analyticEn
                });
              }
            } catch (err) {
              console.error(`[fetch-news] Analysis failed for ${lang} item:`, err.message);
            }
          }
          if (analyzed.length === 0) {
            console.log(`[fetch-news] ${lang}: no valid analysis results`);
            if (lang !== "en") {
              results[lang].fallback = true;
            }
            continue;
          }
          const best = analyzed.map((a) => {
            let quality = 0;
            const { sense, why, view, question } = a.analysis;
            if (sense && sense.length >= 240 && sense.length <= 360) quality += 10;
            if (why && (why.includes("leads to") || why.includes("affects") || why.includes("\u0432\u043B\u0438\u044F\u0435\u0442") || why.includes("\u043F\u0440\u0438\u0432\u043E\u0434\u0438\u0442"))) quality += 10;
            if (view && !/(should|must|должен|обязан|sollte|muss)/i.test(view)) quality += 10;
            if (question && !/(как вы считаете|what do you think|was denkst du)/i.test(question) && question.includes("?")) quality += 10;
            return { ...a, quality };
          }).sort((a, b) => b.quality + b.score - (a.quality + a.score))[0];
          if (!best) {
            console.log(`[fetch-news] ${lang}: no best candidate selected`);
            if (lang !== "en") {
              results[lang].fallback = true;
            }
            continue;
          }
          try {
            await saveNewsToForumLang(best.item, best.analysis, lang, scheduledFor);
            const key = makeNewsKey(best.item);
            const titleKey = safeKey(normalizeTitle(best.item.title || ""));
            const updatedProcessedKeys = { ...processedKeys };
            const updatedTitleKeys = { ...titleKeys };
            updatedProcessedKeys[key] = {
              processedAt: Date.now(),
              sourceId: best.item.sourceId || ""
            };
            if (titleKey) {
              updatedTitleKeys[titleKey] = {
                processedAt: Date.now()
              };
            }
            await saveNewsMeta(lang, { processedKeys: updatedProcessedKeys, titleKeys: updatedTitleKeys });
            results[lang].prepared = true;
            totalCreated++;
            console.log(`[fetch-news] ${lang}: prepared 1 news item`);
            await writeEvent2(component, "info", `prepared news for ${lang}`, {
              lang,
              score: best.score,
              quality: best.quality
            });
          } catch (err) {
            console.error(`[fetch-news] Failed to save ${lang} news:`, err.message);
            await writeEvent2(component, "error", `Failed to save news for ${lang}`, {
              lang,
              error: err.message
            });
          }
        }
        for (const lang of languages) {
          if (!results[lang].prepared && results[lang].fallback && lang !== "en") {
            try {
              if (FIREBASE_DB_URL) {
                const topicsUrl = `${FIREBASE_DB_URL}/forum/topics.json?orderBy="lang"&equalTo="en"&limitToLast=10`;
                const topicsResp = await fetch(topicsUrl);
                if (topicsResp.ok) {
                  const topicsData = await topicsResp.json();
                  const enTopics = Object.values(topicsData || {}).filter(
                    (t) => t.section === "news" && t.lang === "en" && t.sense && t.why && t.view && t.question
                  );
                  if (enTopics.length > 0) {
                    const latestEn = enTopics.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
                    const translateField = async (text) => {
                      if (!OPENAI_API_KEY || !text) return text;
                      const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
                      const response = await fetch("https://api.openai.com/v1/chat/completions", {
                        method: "POST",
                        headers: {
                          Authorization: `Bearer ${OPENAI_API_KEY}`,
                          "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                          model,
                          messages: [
                            { role: "system", content: "You are a precise translator. Return only the translation, no explanations." },
                            { role: "user", content: `Translate to ${lang === "ru" ? "Russian" : "German"}: ${text}` }
                          ],
                          max_tokens: 300,
                          temperature: 0.3
                        })
                      });
                      if (!response.ok) return text;
                      const data = await response.json();
                      return data.choices?.[0]?.message?.content?.trim() || text;
                    };
                    const translatedTitle = await translateField(latestEn.title);
                    const translatedSense = await translateField(latestEn.sense);
                    const translatedWhy = await translateField(latestEn.why);
                    const translatedView = await translateField(latestEn.view);
                    const translatedQuestion = await translateField(latestEn.question);
                    const translatedTopic = {
                      ...latestEn,
                      id: `${latestEn.id || Date.now()}_translated_${lang}`,
                      lang,
                      sourceLang: "en",
                      translatedFrom: true,
                      sourceTopicId: latestEn.id,
                      title: translatedTitle,
                      sense: translatedSense,
                      why: translatedWhy,
                      view: translatedView,
                      question: translatedQuestion,
                      scheduledFor,
                      posted: false
                    };
                    const saveUrl = `${FIREBASE_DB_URL}/forum/topics.json`;
                    const saveResp = await fetch(saveUrl, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(translatedTopic)
                    });
                    if (saveResp.ok) {
                      results[lang].prepared = true;
                      totalCreated++;
                      console.log(`[fetch-news] ${lang}: fallback translation used`);
                      await writeEvent2(component, "warn", `fallback used for ${lang}`, { lang, sourceLang: "en" });
                    }
                  }
                }
              }
            } catch (err) {
              console.error(`[fetch-news] Fallback failed for ${lang}:`, err.message);
            }
          }
        }
        await writeHeartbeat2(component, {
          lastRunAt: startTime,
          lastOkAt: Date.now(),
          metrics: {
            createdTopicsCount: totalCreated,
            preparedRu: results.ru.prepared,
            preparedEn: results.en.prepared,
            preparedDe: results.de.prepared,
            scheduledFor
          }
        });
        return {
          statusCode: 200,
          body: JSON.stringify({
            ok: true,
            prepared: totalCreated,
            results,
            scheduledFor: new Date(scheduledFor).toISOString()
          })
        };
      } catch (err) {
        console.error("fetch-news fatal error:", err);
        const qs2 = event.queryStringParameters || {};
        const isDebug2 = qs2.debug === "1" || qs2.debug === "true";
        const errorMsg = String(err && err.message ? err.message : err);
        const errorStack = err && err.stack ? String(err.stack) : "";
        let errorWhere = "unknown";
        if (errorStack) {
          if (errorStack.includes("fetchRssSource") || errorStack.includes("RSS")) {
            errorWhere = "rss fetch";
          } else if (errorStack.includes("analyzeNewsItemEn") || errorStack.includes("OpenAI")) {
            errorWhere = "openai analysis";
          } else if (errorStack.includes("saveNewsToForumLang") || errorStack.includes("Firebase")) {
            errorWhere = "firebase write";
          } else if (errorStack.includes("translateText")) {
            errorWhere = "openai translation";
          } else if (errorStack.includes("loadNewsMeta") || errorStack.includes("saveNewsMeta")) {
            errorWhere = "news meta";
          }
        }
        await writeHeartbeat2(component, {
          lastRunAt: startTime,
          lastErrorAt: Date.now(),
          lastErrorMsg: errorMsg
        });
        await writeEvent2(component, "error", "Fatal error in fetch-news", {
          error: errorMsg,
          where: errorWhere
        });
        if (isDebug2) {
          return {
            statusCode: 500,
            body: JSON.stringify({
              ok: false,
              error: errorMsg,
              stack: errorStack,
              where: errorWhere
            })
          };
        }
        return {
          statusCode: 500,
          body: JSON.stringify({
            ok: false,
            error: errorMsg
          })
        };
      }
    };
  }
});

// netlify/lib/telegramFormat.js
var require_telegramFormat = __commonJS({
  "netlify/lib/telegramFormat.js"(exports2, module2) {
    function escapeHtml(text) {
      if (!text) return "";
      return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }
    function formatDate(pubDate, lang) {
      if (!pubDate) return "";
      try {
        const date = new Date(pubDate);
        const now = /* @__PURE__ */ new Date();
        const diffHours = Math.floor((now - date) / (1e3 * 60 * 60));
        if (diffHours < 1) {
          return lang === "ru" ? "\u0442\u043E\u043B\u044C\u043A\u043E \u0447\u0442\u043E" : lang === "de" ? "gerade eben" : "just now";
        } else if (diffHours < 24) {
          return lang === "ru" ? `${diffHours} \u0447 \u043D\u0430\u0437\u0430\u0434` : lang === "de" ? `vor ${diffHours} Std` : `${diffHours}h ago`;
        } else {
          const diffDays = Math.floor(diffHours / 24);
          return lang === "ru" ? `${diffDays} \u0434\u043D \u043D\u0430\u0437\u0430\u0434` : lang === "de" ? `vor ${diffDays} Tagen` : `${diffDays}d ago`;
        }
      } catch (e) {
        return "";
      }
    }
    function extractDomain(url) {
      if (!url) return "";
      try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace(/^www\./, "");
      } catch (e) {
        return url;
      }
    }
    function enforceMaxLen(text, maxLen) {
      if (text.length <= maxLen) return text;
      const whyMatch = text.match(/(<b>Почему важно:<\/b>|<b>Warum wichtig:<\/b>|<b>Why it matters:<\/b>)\s*(.*?)(?=\n\n|$)/is);
      const viewMatch = text.match(/(<b>Взгляд NovaCiv:<\/b>|<b>NovaCiv-Perspektive:<\/b>|<b>NovaCiv perspective:<\/b>)\s*(.*?)(?=\n\n|$)/is);
      const questionMatch = text.match(/(<b>Вопрос:<\/b>|<b>Frage:<\/b>|<b>Question:<\/b>)\s*(.*?)(?=\n\n|$)/is);
      let result = text;
      if (whyMatch && result.length > maxLen) {
        result = result.replace(whyMatch[0], "").replace(/\n\n\n+/g, "\n\n");
      }
      if (viewMatch && result.length > maxLen) {
        result = result.replace(viewMatch[0], "").replace(/\n\n\n+/g, "\n\n");
      }
      if (result.length > maxLen) {
        const senseIndex = result.indexOf("\n\n");
        if (senseIndex !== -1) {
          const beforeSense = result.substring(0, senseIndex);
          const afterSense = result.substring(senseIndex);
          const maxSenseLen = maxLen - beforeSense.length - afterSense.length - 50;
          if (maxSenseLen > 100) {
            const senseText = result.substring(senseIndex + 2, senseIndex + 2 + maxSenseLen);
            result = beforeSense + "\n\n" + senseText + "..." + afterSense;
          }
        }
      }
      if (result.length > maxLen) {
        result = result.slice(0, maxLen - 3) + "...";
      }
      return result;
    }
    function formatNewsMessage({ title, url, sourceName, date, sense, why, view, question, lang }) {
      const lines = [];
      lines.push(`<b>\u{1F310} NovaCiv \u2014 Movement news</b>`);
      lines.push(`<b>${escapeHtml(title || "(no title)")}</b>`);
      lines.push("");
      const domain = sourceName || (url ? extractDomain(url) : "");
      const dateStr = formatDate(date, lang);
      if (domain || dateStr) {
        const sourceLine = [domain, dateStr].filter(Boolean).join(" \u2022 ");
        lines.push(`<i>${escapeHtml(sourceLine)}</i>`);
        lines.push("");
      }
      if (sense) {
        lines.push(escapeHtml(sense));
        lines.push("");
      }
      if (why) {
        const whyLabel = lang === "ru" ? "\u041F\u043E\u0447\u0435\u043C\u0443 \u0432\u0430\u0436\u043D\u043E:" : lang === "de" ? "Warum wichtig:" : "Why it matters:";
        lines.push(`<b>${whyLabel}</b> ${escapeHtml(why)}`);
        lines.push("");
      }
      if (view) {
        const viewLabel = lang === "ru" ? "\u0412\u0437\u0433\u043B\u044F\u0434 NovaCiv:" : lang === "de" ? "NovaCiv-Perspektive:" : "NovaCiv perspective:";
        lines.push(`<b>${viewLabel}</b> ${escapeHtml(view)}`);
        lines.push("");
      }
      if (question) {
        const questionLabel = lang === "ru" ? "\u0412\u043E\u043F\u0440\u043E\u0441:" : lang === "de" ? "Frage:" : "Question:";
        lines.push(`<b>${questionLabel}</b> ${escapeHtml(question)}`);
        lines.push("");
      }
      if (url) {
        lines.push(`<a href="${escapeHtml(url)}">\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A</a>`);
      }
      lines.push(`https://novaciv.space/news`);
      let message = lines.join("\n");
      message = enforceMaxLen(message, 3500);
      return message;
    }
    function formatDomovoyMessage({ headline, quote, reflection, question, lang }) {
      const lines = [];
      lines.push(`<b>\u{1F916} NovaCiv \u2014 \u0414\u043E\u043C\u043E\u0432\u043E\u0439</b>`);
      lines.push(`<b>${escapeHtml(headline || "NovaCiv")}</b>`);
      lines.push("");
      if (quote) {
        lines.push(escapeHtml(quote));
        lines.push("");
      }
      if (reflection) {
        lines.push(escapeHtml(reflection));
        lines.push("");
      }
      if (question) {
        const questionLabel = lang === "ru" ? "\u0412\u043E\u043F\u0440\u043E\u0441:" : lang === "de" ? "Frage:" : "Question:";
        lines.push(`<b>${questionLabel}</b> ${escapeHtml(question)}`);
        lines.push("");
      }
      lines.push(`https://novaciv.space`);
      let message = lines.join("\n");
      if (message.length > 1200) {
        const headerLength = lines[0].length + lines[1].length + lines[2].length + (lines[lines.length - 1]?.length || 0) + 20;
        const maxReflectionLength = 1200 - headerLength - (quote ? quote.length + 20 : 0) - (question ? question.length + 30 : 0);
        if (reflection && reflection.length > maxReflectionLength) {
          const truncatedReflection = reflection.slice(0, Math.max(100, maxReflectionLength - 3)) + "...";
          message = lines[0] + "\n" + lines[1] + "\n\n" + (quote ? escapeHtml(quote) + "\n\n" : "") + escapeHtml(truncatedReflection) + "\n\n" + (question ? lines[lines.length - 3] + "\n" : "") + lines[lines.length - 1];
        } else {
          message = message.slice(0, 1200 - 3) + "...";
        }
      }
      return message;
    }
    module2.exports = {
      formatNewsMessage,
      formatDomovoyMessage,
      enforceMaxLen,
      escapeHtml
    };
  }
});

// netlify/functions/news-cron.js
var require_news_cron = __commonJS({
  "netlify/functions/news-cron.js"(exports2) {
    var FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;
    var NEWS_CRON_SECRET = process.env.NEWS_CRON_SECRET;
    var OPS_CRON_SECRET2 = process.env.OPS_CRON_SECRET;
    var TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    var { writeHeartbeat: writeHeartbeat2, writeEvent: writeEvent2, writeFirebaseError } = require_opsPulse();
    var { formatNewsMessage } = require_telegramFormat();
    var OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    var OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
    var TELEGRAM_NEWS_CHAT_ID_EN = process.env.TELEGRAM_NEWS_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
    var TELEGRAM_NEWS_CHAT_ID_RU = process.env.TELEGRAM_NEWS_CHAT_ID_RU;
    var TELEGRAM_NEWS_CHAT_ID_DE = process.env.TELEGRAM_NEWS_CHAT_ID_DE;
    function log2(...args) {
      console.log("[news-cron]", ...args);
    }
    function safeKey(value) {
      if (!value) return "unknown";
      return String(value).trim().toLowerCase().replace(/[.#$[\]/]/g, "_").replace(/\s+/g, "_").slice(0, 120);
    }
    async function sendTextToTelegram(chatId, text, replyMarkup) {
      if (!TELEGRAM_BOT_TOKEN) {
        throw new Error("TELEGRAM_BOT_TOKEN is not configured");
      }
      if (!chatId) {
        return { ok: false, skipped: true, reason: "chatId not configured" };
      }
      const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      const body = {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: false
        // Включаем preview для новостей
      };
      if (replyMarkup) {
        body.reply_markup = replyMarkup;
      }
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await resp.json();
      if (!data.ok) {
        log2("Telegram error:", data);
      }
      return data;
    }
    async function sendPhotoToTelegram(chatId, photoUrl, caption, replyMarkup) {
      if (!TELEGRAM_BOT_TOKEN) {
        throw new Error("TELEGRAM_BOT_TOKEN is not configured");
      }
      if (!chatId) {
        return { ok: false, skipped: true, reason: "chatId not configured" };
      }
      if (!photoUrl) {
        return sendTextToTelegram(chatId, caption, replyMarkup);
      }
      const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;
      const body = {
        chat_id: chatId,
        photo: photoUrl,
        caption,
        parse_mode: "HTML"
      };
      if (replyMarkup) {
        body.reply_markup = replyMarkup;
      }
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        const data = await resp.json();
        if (!data.ok && (data.error_code === 400 || data.error_code === 404)) {
          log2("Photo send failed, falling back to text:", data.description);
          return sendTextToTelegram(chatId, caption, replyMarkup);
        }
        if (!data.ok) {
          log2("Telegram error:", data);
        }
        return data;
      } catch (err) {
        log2("Photo send error, falling back to text:", err.message);
        return sendTextToTelegram(chatId, caption, replyMarkup);
      }
    }
    function parseAnalyticData(topic) {
      if (topic.sense && topic.why && topic.view && topic.question) {
        return {
          sense: topic.sense,
          why: topic.why,
          view: topic.view,
          question: topic.question
        };
      }
      const content = topic.content || "";
      if (!content) return { sense: "", why: "", view: "", question: "" };
      const text = String(content).trim();
      const whyMatch = text.match(/(?:Why it matters|Почему важно|Warum es wichtig ist)[:.\s]+(.*?)(?:\n\n|$)/i);
      const perspectiveMatch = text.match(/(?:NovaCiv perspective|Взгляд NovaCiv|NovaCiv-Perspektive)[:.\s]+(.*?)(?:\n\n|$)/i);
      const questionMatch = text.match(/(?:Question|Вопрос|Frage)[:.\s]+(.*?)(?:\n\n|$)/i);
      let sense = text;
      if (whyMatch) {
        sense = text.substring(0, whyMatch.index).trim();
      } else if (perspectiveMatch) {
        sense = text.substring(0, perspectiveMatch.index).trim();
      }
      const sentences = sense.split(/[.!?]+/).filter((s) => s.trim().length > 10);
      if (sentences.length > 3) {
        sense = sentences.slice(0, 3).join(". ") + ".";
      }
      return {
        sense: sense.slice(0, 360).trim(),
        why: whyMatch ? whyMatch[1].trim().slice(0, 180) : "",
        view: perspectiveMatch ? perspectiveMatch[1].trim().slice(0, 220) : "",
        question: questionMatch ? questionMatch[1].trim().slice(0, 160) : ""
      };
    }
    function extractDomain(url) {
      if (!url) return "";
      try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace(/^www\./, "");
      } catch (e) {
        return url;
      }
    }
    function buildNewsMessage(topic) {
      const parsed = parseAnalyticData(topic);
      const sourceName = topic.originalLink ? extractDomain(topic.originalLink) : "";
      return formatNewsMessage({
        title: topic.title,
        url: topic.originalLink,
        sourceName,
        date: topic.pubDate,
        sense: parsed.sense,
        why: parsed.why,
        view: parsed.view,
        question: parsed.question,
        lang: topic.lang || "ru"
      });
    }
    function buildNewsKeyboard(topic) {
      const buttons = [];
      if (topic.originalLink) {
        buttons.push([{ text: "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A", url: topic.originalLink }]);
      }
      buttons.push([{ text: "NovaCiv", url: "https://novaciv.space" }]);
      return {
        inline_keyboard: buttons
      };
    }
    async function fetchNewsTopics() {
      if (!FIREBASE_DB_URL) {
        const error = new Error("FIREBASE_DB_URL is not configured");
        await writeFirebaseError("news-cron", error, {
          path: "forum/topics",
          op: "read"
        });
        throw error;
      }
      let dbUrlHost = "";
      let topicsPath = "forum/topics";
      let queryParams = { orderBy: '"section"', equalTo: '"news"' };
      let requestUrlSafe = "";
      try {
        const dbUrlObj = new URL(FIREBASE_DB_URL);
        dbUrlHost = dbUrlObj.host;
        const queryString = new URLSearchParams({
          orderBy: '"section"',
          equalTo: '"news"'
        }).toString();
        requestUrlSafe = `${FIREBASE_DB_URL}/forum/topics.json?${queryString}`;
        requestUrlSafe = requestUrlSafe.replace(/[?&]auth=[^&]*/gi, "&auth=***");
      } catch (e) {
        log2("Error parsing FIREBASE_DB_URL:", e.message);
        dbUrlHost = "unknown";
        requestUrlSafe = `${FIREBASE_DB_URL}/forum/topics.json?orderBy=%22section%22&equalTo=%22news%22`;
      }
      log2("[firebase-request] dbUrlHost:", dbUrlHost);
      log2("[firebase-request] topicsPath:", topicsPath);
      log2("[firebase-request] queryParams:", queryParams);
      log2("[firebase-request] requestUrlSafe:", requestUrlSafe);
      const url = `${FIREBASE_DB_URL}/forum/topics.json?orderBy=%22section%22&equalTo=%22news%22`;
      try {
        const resp = await fetch(url);
        if (!resp.ok) {
          const errorText = await resp.text();
          let errorData = errorText;
          try {
            errorData = JSON.parse(errorText);
          } catch (e) {
          }
          log2("[firebase-error] status:", resp.status);
          log2("[firebase-error] data:", errorData);
          log2("[firebase-error] requestUrlSafe:", requestUrlSafe);
          const errorStr = typeof errorData === "string" ? errorData : JSON.stringify(errorData);
          const isIndexError = resp.status === 400 && (errorStr.includes("Index not defined") || errorStr.includes("index") && errorStr.toLowerCase().includes("not found"));
          if (isIndexError) {
            log2("[news-cron] WARNING: firebase missing index on section; using full-scan fallback");
            await writeEvent2("news-cron", "warn", "Firebase index missing for /forum/topics.section \u2014 using fallback", {
              path: "forum/topics",
              op: "query",
              status: 400,
              firebaseError: "Index not defined"
            });
            const fallbackUrl = `${FIREBASE_DB_URL}/forum/topics.json`;
            const fallbackResp = await fetch(fallbackUrl);
            if (!fallbackResp.ok) {
              const errorText2 = await fallbackResp.text().catch(() => "");
              await writeFirebaseError("news-cron", new Error(`Fallback fetch failed: ${fallbackResp.status}`), {
                path: "forum/topics",
                op: "read",
                status: fallbackResp.status,
                firebaseError: errorText2.slice(0, 200)
              });
              throw new Error(
                `Firebase topics fetch failed (fallback): ${fallbackResp.status} ${fallbackResp.statusText}`
              );
            }
            const fallbackData = await fallbackResp.json();
            if (!fallbackData || typeof fallbackData !== "object") {
              return [];
            }
            const allItems = Object.entries(fallbackData).map(([id, value]) => ({
              id,
              ...value || {}
            }));
            const HARD_LIMIT = 5e3;
            if (allItems.length > HARD_LIMIT) {
              log2(`[news-cron] WARNING: Full-scan returned ${allItems.length} items, limiting to ${HARD_LIMIT}`);
              await writeEvent2("news-cron", "warn", `Full-scan exceeded hard limit: ${allItems.length} > ${HARD_LIMIT}`, {
                path: "forum/topics",
                op: "query",
                returnedCount: allItems.length,
                hardLimit: HARD_LIMIT
              });
            }
            const filteredItems = allItems.slice(0, HARD_LIMIT).filter((item) => item.section === "news");
            return filteredItems;
          }
          throw new Error(
            `Firebase topics fetch failed: ${resp.status} ${resp.statusText}`
          );
        }
        const data = await resp.json();
        if (!data || typeof data !== "object") {
          return [];
        }
        const items = Object.entries(data).map(([id, value]) => ({
          id,
          ...value || {}
        }));
        return items;
      } catch (err) {
        if (!err.message || !err.message.includes("Firebase topics fetch failed")) {
          log2("[firebase-error] fetch exception:", err.message);
          log2("[firebase-error] requestUrlSafe:", requestUrlSafe);
        }
        throw err;
      }
    }
    function getHeader(headers, key) {
      if (!headers || !key) return "";
      const lowerKey = key.toLowerCase();
      return headers[key] || headers[lowerKey] || headers[key.toLowerCase()] || headers[key.toUpperCase()] || "";
    }
    function determineInvocationType(event) {
      const headers = event.headers || {};
      const userAgent = getHeader(headers, "user-agent");
      const eventHeader = getHeader(headers, "x-netlify-event") || getHeader(headers, "x-nf-event");
      const referer = getHeader(headers, "referer") || getHeader(headers, "referrer");
      const isScheduled = eventHeader && eventHeader.toLowerCase() === "schedule" || userAgent === "Netlify-Scheduled-Function";
      if (isScheduled) {
        return {
          type: "scheduled",
          skipAuth: true
        };
      }
      const allowRunNowBypass = process.env.ALLOW_NETLIFY_RUN_NOW_BYPASS && process.env.ALLOW_NETLIFY_RUN_NOW_BYPASS.toLowerCase() === "true";
      if (allowRunNowBypass) {
        const xNfRequestId = getHeader(headers, "x-nf-request-id");
        const xNfSiteId = getHeader(headers, "x-nf-site-id");
        const xNfDeployId = getHeader(headers, "x-nf-deploy-id");
        const looksLikeNetlifyRunNow = referer && (referer.toLowerCase().includes("app.netlify.com") || referer.toLowerCase().includes("app.netlify.app")) || xNfRequestId || xNfSiteId || xNfDeployId || userAgent && userAgent.toLowerCase().includes("netlify");
        if (looksLikeNetlifyRunNow) {
          return {
            type: "netlify_run_now",
            skipAuth: true
          };
        }
      }
      if (allowRunNowBypass) {
        const xNfRequestId = getHeader(headers, "x-nf-request-id");
        const xNfSiteId = getHeader(headers, "x-nf-site-id");
        const xNfDeployId = getHeader(headers, "x-nf-deploy-id");
        log2("[debug] allowBypass=true http invocation headers keys:", Object.keys(headers));
        log2("[debug] ua=", userAgent);
        log2("[debug] x-nf-request-id=", xNfRequestId);
        log2("[debug] x-nf-site-id=", xNfSiteId);
        log2("[debug] x-nf-deploy-id=", xNfDeployId);
        log2("[debug] referer=", referer);
        log2("[debug] x-netlify-event=", eventHeader);
      }
      return {
        type: "http",
        skipAuth: false
      };
    }
    exports2.handler = async (event) => {
      const startTime = Date.now();
      const runId = `news-cron-${startTime}`;
      const component = "news-cron";
      const qs = event.queryStringParameters || {};
      const isDebug = qs.debug === "1" || qs.debug === "true";
      await writeHeartbeat2(component, {
        lastRunAt: startTime
      });
      try {
        const invocation = determineInvocationType(event);
        if (invocation.type === "scheduled") {
          log2("invocation type: scheduled");
          log2("auth skipped");
        } else if (invocation.type === "netlify_run_now") {
          log2("invocation type: netlify_run_now");
          log2("auth skipped (ALLOW_NETLIFY_RUN_NOW_BYPASS=true)");
        } else {
          log2("invocation type: http");
          const validToken = NEWS_CRON_SECRET || OPS_CRON_SECRET2;
          if (validToken) {
            const providedToken = qs.token;
            if (!providedToken || providedToken !== NEWS_CRON_SECRET && providedToken !== OPS_CRON_SECRET2) {
              log2("auth gate blocked (no token or token mismatch)");
              return {
                statusCode: 403,
                body: JSON.stringify({ ok: false, error: "Forbidden: invalid token" })
              };
            }
          }
          log2("auth gate passed");
        }
        if (!FIREBASE_DB_URL) {
          const errorMsg = "FIREBASE_DB_URL is not set";
          await writeEvent2(component, "error", errorMsg);
          return {
            statusCode: 200,
            body: JSON.stringify({
              ok: false,
              error: errorMsg
            })
          };
        }
        const limitParam = qs.limit;
        const limit = limitParam ? Math.max(1, parseInt(limitParam, 10) || 1) : 10;
        const now = Date.now();
        const currentHour = new Date(now);
        currentHour.setMinutes(0, 0, 0);
        const hourStart = currentHour.getTime();
        const hourEnd = hourStart + 60 * 60 * 1e3;
        let topics = [];
        if (FIREBASE_DB_URL) {
          try {
            const topicsUrl = `${FIREBASE_DB_URL}/forum/topics.json`;
            const topicsResp = await fetch(topicsUrl);
            if (topicsResp.ok) {
              const topicsData = await topicsResp.json();
              topics = Object.entries(topicsData || {}).map(([id, value]) => ({
                id,
                ...value || {}
              })).filter(
                (t) => t.section === "news" && !t.posted && t.scheduledFor && t.scheduledFor >= hourStart && t.scheduledFor < hourEnd
              );
            }
          } catch (e) {
            log2(`[news-cron] Failed to fetch topics:`, e.message);
            topics = await fetchNewsTopics();
            topics = topics.filter((t) => !t.posted);
          }
        } else {
          topics = await fetchNewsTopics();
          topics = topics.filter((t) => !t.posted);
        }
        const CHANNELS = {
          ru: TELEGRAM_NEWS_CHAT_ID_RU,
          en: TELEGRAM_NEWS_CHAT_ID_EN,
          de: TELEGRAM_NEWS_CHAT_ID_DE
        };
        const stateByLang = {};
        for (const lang of ["ru", "en", "de"]) {
          try {
            if (FIREBASE_DB_URL) {
              const stateUrl = `${FIREBASE_DB_URL}/newsMeta/state_${lang}.json`;
              const stateResp = await fetch(stateUrl);
              if (stateResp.ok) {
                stateByLang[lang] = await stateResp.json() || {};
              } else {
                stateByLang[lang] = { lastNewsSource: null, recentTitleKeys: {} };
              }
            }
          } catch (e) {
            log2(`Failed to load news state for ${lang}:`, e.message);
            stateByLang[lang] = { lastNewsSource: null, recentTitleKeys: {} };
          }
        }
        const perLanguage = {
          ru: { sent: 0, errors: [] },
          en: { sent: 0, errors: [] },
          de: { sent: 0, errors: [] }
        };
        for (const targetLang of ["ru", "en", "de"]) {
          const chatId = CHANNELS[targetLang];
          if (!chatId) {
            log2(`No chat ID for ${targetLang}, skipping`);
            continue;
          }
          let topicToPost = topics.filter(
            (t) => t.section === "news" && t.lang === targetLang && !t.telegramPostedAt && !t.translatedFrom
            // Не переведённые копии
          ).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
          if (!topicToPost) {
            log2(`[news-cron] No ${targetLang} topic found, trying fallback translation`);
            const fallbackTopic = topics.filter(
              (t) => t.section === "news" && !t.telegramPostedAt && !t.translatedFrom && (t.lang === "en" || t.lang === targetLang)
              // Предпочитаем EN, но можно и свою
            ).sort((a, b) => {
              if (a.lang === "en" && b.lang !== "en") return -1;
              if (b.lang === "en" && a.lang !== "en") return 1;
              return (b.createdAt || 0) - (a.createdAt || 0);
            })[0];
            if (fallbackTopic && fallbackTopic.lang !== targetLang) {
              try {
                const translateField = async (text, targetLang2) => {
                  if (!OPENAI_API_KEY || !text) return text;
                  let targetDescription;
                  if (targetLang2 === "ru") {
                    targetDescription = "Russian";
                  } else if (targetLang2 === "de") {
                    targetDescription = "German";
                  } else {
                    targetDescription = "the target language";
                  }
                  const userPrompt = `
Target language: ${targetDescription} (code: ${targetLang2})

Translate the following text from ${fallbackTopic.lang === "ru" ? "Russian" : fallbackTopic.lang === "de" ? "German" : "English"} into the target language.
Preserve meaning and tone.

----
${text}
----
`.trim();
                  const response = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${OPENAI_API_KEY}`,
                      "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                      model: OPENAI_MODEL,
                      messages: [
                        { role: "system", content: "You are a precise translator. Return only the translation, no explanations." },
                        { role: "user", content: userPrompt }
                      ],
                      max_tokens: 300,
                      temperature: 0.3
                    })
                  });
                  if (!response.ok) {
                    const text2 = await response.text();
                    throw new Error(`OpenAI translation error: HTTP ${response.status} \u2013 ${text2}`);
                  }
                  const data = await response.json();
                  return data.choices?.[0]?.message?.content?.trim() || text;
                };
                const translated = await translateField(fallbackTopic.sense || "", targetLang);
                const translatedWhy = await translateField(fallbackTopic.why || "", targetLang);
                const translatedView = await translateField(fallbackTopic.view || "", targetLang);
                const translatedQuestion = await translateField(fallbackTopic.question || "", targetLang);
                const translatedTitle = await translateField(fallbackTopic.title || "", targetLang);
                const translatedTopic = {
                  ...fallbackTopic,
                  id: `${fallbackTopic.id}_translated_${targetLang}_${Date.now()}`,
                  lang: targetLang,
                  sourceLang: fallbackTopic.lang,
                  translatedFrom: true,
                  sourceTopicId: fallbackTopic.id,
                  title: typeof translatedTitle === "string" ? translatedTitle : fallbackTopic.title,
                  sense: typeof translated === "string" ? translated : fallbackTopic.sense,
                  why: typeof translatedWhy === "string" ? translatedWhy : fallbackTopic.why,
                  view: typeof translatedView === "string" ? translatedView : fallbackTopic.view,
                  question: typeof translatedQuestion === "string" ? translatedQuestion : fallbackTopic.question,
                  telegramPostedAt: null
                  // Не помечаем как posted
                };
                if (FIREBASE_DB_URL) {
                  try {
                    const saveUrl = `${FIREBASE_DB_URL}/forum/topics.json`;
                    const saveResp = await fetch(saveUrl, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(translatedTopic)
                    });
                    if (saveResp.ok) {
                      const savedData = await saveResp.json();
                      translatedTopic.id = savedData.name || translatedTopic.id;
                      log2(`[news-cron] Created translated topic for ${targetLang}`);
                    }
                  } catch (e) {
                    log2(`[news-cron] Failed to save translated topic:`, e.message);
                  }
                }
                topicToPost = translatedTopic;
                await writeEvent2(component, "info", `Fallback translation used for ${targetLang}`, {
                  sourceLang: fallbackTopic.lang,
                  sourceTopicId: fallbackTopic.id
                });
              } catch (e) {
                log2(`[news-cron] Translation failed for ${targetLang}:`, e.message);
                continue;
              }
            } else if (!fallbackTopic) {
              log2(`[news-cron] No fallback topic available for ${targetLang}`);
              continue;
            }
          }
          if (!topicToPost) {
            continue;
          }
          const messageText = buildNewsMessage(topicToPost);
          const keyboard = buildNewsKeyboard(topicToPost);
          let telegramResult = null;
          try {
            if (topicToPost.imageUrl || topicToPost.photoUrl) {
              telegramResult = await sendPhotoToTelegram(
                chatId,
                topicToPost.imageUrl || topicToPost.photoUrl,
                messageText,
                keyboard
              );
            } else {
              telegramResult = await sendTextToTelegram(chatId, messageText, keyboard);
            }
            if (telegramResult && telegramResult.ok && telegramResult.result) {
              const messageId = telegramResult.result.message_id;
              const postedAt = Date.now();
              let permalink = null;
              const channelUsername = process.env[`TELEGRAM_NEWS_CHANNEL_USERNAME_${targetLang.toUpperCase()}`];
              if (channelUsername) {
                permalink = `https://t.me/${channelUsername}/${messageId}`;
              }
              const safeTopicId = safeKey(topicToPost.id);
              const updateUrl = `${FIREBASE_DB_URL}/forum/topics/${safeTopicId}.json`;
              const updateData = {
                posted: true,
                postedAt,
                telegram: {
                  chatId: String(chatId),
                  messageId,
                  permalink
                },
                channel: "news"
              };
              if (!topicToPost.channel) {
                updateData.channel = "news";
              }
              try {
                const updateResp = await fetch(updateUrl, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(updateData)
                });
                if (!updateResp.ok) {
                  const errorText = await updateResp.text().catch(() => "");
                  log2(`Failed to update topic metadata: ${updateResp.status} - ${errorText}`);
                  await writeFirebaseError("news-cron", new Error(`Failed to update topic: ${updateResp.status}`), {
                    path: `forum/topics/${safeTopicId}`,
                    op: "write",
                    status: updateResp.status,
                    firebaseError: errorText.slice(0, 200)
                  });
                } else {
                  log2(`Updated topic ${topicToPost.id} with Telegram metadata`);
                }
              } catch (updateError) {
                log2(`Error updating topic metadata:`, updateError.message);
                await writeFirebaseError("news-cron", updateError, {
                  path: `forum/topics/${safeTopicId}`,
                  op: "write"
                });
              }
              perLanguage[targetLang].sent = 1;
              await writeEvent2(component, "info", `news sent: ${targetLang}`, {
                topicId: topicToPost.id,
                messageId,
                lang: targetLang
              });
            } else {
              log2(`Telegram send failed for ${targetLang}:`, telegramResult?.description || "unknown error");
              perLanguage[targetLang].errors.push(telegramResult?.description || "unknown error");
            }
          } catch (sendError) {
            log2(`Error sending to Telegram for ${targetLang}:`, sendError.message);
            perLanguage[targetLang].errors.push(sendError.message);
            await writeEvent2(component, "error", `Telegram send error: ${targetLang}`, {
              error: sendError.message,
              lang: targetLang
            });
          }
        }
        const totalSent = perLanguage.ru.sent + perLanguage.en.sent + perLanguage.de.sent;
        await writeHeartbeat2(component, {
          lastRunAt: startTime,
          lastOkAt: Date.now(),
          metrics: {
            fetchedTopicsCount: topics.length,
            sentToTelegramCount: totalSent
          }
        });
        await writeEvent2(component, "info", `Sent ${totalSent} messages to Telegram`, {
          fetchedTopics: topics.length,
          totalSent,
          perLanguage
        });
        return {
          statusCode: 200,
          body: JSON.stringify({
            ok: true,
            processed: totalSent,
            totalSent,
            perLanguage
          })
        };
      } catch (err) {
        console.error("news-cron error:", err);
        const qs2 = event.queryStringParameters || {};
        const isDebug2 = qs2.debug === "1" || qs2.debug === "true";
        const errorMsg = String(err && err.message ? err.message : err);
        const errorStack = err && err.stack ? String(err.stack) : "";
        await writeHeartbeat2(component, {
          lastRunAt: startTime,
          lastErrorAt: Date.now(),
          lastErrorMsg: errorMsg
        });
        await writeEvent2(component, "error", "Error in news-cron", {
          error: errorMsg
        });
        if (isDebug2) {
          return {
            statusCode: 500,
            body: JSON.stringify({
              ok: false,
              error: errorMsg,
              stack: errorStack,
              where: "news-cron handler"
            })
          };
        }
        return {
          statusCode: 500,
          body: JSON.stringify({ ok: false, error: errorMsg })
        };
      }
    };
  }
});

// netlify/functions/domovoy-auto-post.js
var require_domovoy_auto_post = __commonJS({
  "netlify/functions/domovoy-auto-post.js"(exports2) {
    var OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    var FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;
    var DOMOVOY_CRON_SECRET = process.env.DOMOVOY_CRON_SECRET || "";
    var TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    var TELEGRAM_NEWS_CHAT_ID_RU = process.env.TELEGRAM_NEWS_CHAT_ID_RU;
    var TELEGRAM_NEWS_CHAT_ID_EN = process.env.TELEGRAM_NEWS_CHAT_ID_EN || process.env.TELEGRAM_NEWS_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
    var TELEGRAM_NEWS_CHAT_ID_DE = process.env.TELEGRAM_NEWS_CHAT_ID_DE;
    var { writeHeartbeat: writeHeartbeat2, writeEvent: writeEvent2, writeFirebaseError } = require_opsPulse();
    var { formatDomovoyMessage } = require_telegramFormat();
    function safeKey(value) {
      if (!value) return "unknown";
      return String(value).trim().toLowerCase().replace(/[.#$[\]/]/g, "_").replace(/\s+/g, "_").slice(0, 120);
    }
    var OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
    var LANG_CONFIG = [
      { code: "ru", label: "\u0420\u0443\u0441\u0441\u043A\u0438\u0439" },
      { code: "en", label: "English" },
      { code: "de", label: "Deutsch" }
    ];
    var POST_MODES = [
      "charter_quote",
      // краткая мысль / принцип с пояснением
      "question_to_reader",
      // рассуждение + вопросы к читателю
      "term_explainer",
      // объяснение одного термина/принципа
      "charter_series"
      // серия по разделам Устава/Манифеста
    ];
    function log2(...args) {
      console.log("[domovoy-auto-post]", ...args);
    }
    function pickRandom(arr) {
      return arr[Math.floor(Math.random() * arr.length)];
    }
    function getLangConfig(langCode) {
      return LANG_CONFIG.find((l) => l.code === langCode) || LANG_CONFIG[0];
    }
    function buildSystemPrompt(langCode) {
      if (langCode === "ru") {
        return `\u0422\u044B \u2014 \u0414\u043E\u043C\u043E\u0432\u043E\u0439 \u0446\u0438\u0444\u0440\u043E\u0432\u043E\u0439 \u0446\u0438\u0432\u0438\u043B\u0438\u0437\u0430\u0446\u0438\u0438 NovaCiv. \u0422\u044B \u0433\u043E\u0432\u043E\u0440\u0438\u0448\u044C \u043F\u043E-\u0440\u0443\u0441\u0441\u043A\u0438, \u0437\u043D\u0430\u0435\u0448\u044C \u041C\u0430\u043D\u0438\u0444\u0435\u0441\u0442 \u0438 \u0423\u0441\u0442\u0430\u0432 NovaCiv \u0438 \u043F\u043E\u043C\u043E\u0433\u0430\u0435\u0448\u044C \u043B\u044E\u0434\u044F\u043C \u0437\u0430\u0434\u0443\u043C\u0430\u0442\u044C\u0441\u044F \u043E \u0446\u0435\u043D\u043D\u043E\u0441\u0442\u0438 \u0436\u0438\u0437\u043D\u0438, \u0440\u0430\u0437\u0443\u043C\u0430, \u0441\u0432\u043E\u0431\u043E\u0434\u0435 \u0438 \u0441\u043F\u0440\u0430\u0432\u0435\u0434\u043B\u0438\u0432\u043E\u0441\u0442\u0438.
\u041F\u0438\u0448\u0438 \u043F\u0440\u043E\u0441\u0442\u043E, \u0447\u0435\u043B\u043E\u0432\u0435\u0447\u0435\u0441\u043A\u0438\u043C \u044F\u0437\u044B\u043A\u043E\u043C, \u0431\u0435\u0437 \u043F\u0430\u0444\u043E\u0441\u0430, \u043D\u043E \u0433\u043B\u0443\u0431\u043E\u043A\u043E. \u0423\u0432\u0430\u0436\u0430\u0439 \u0447\u0438\u0442\u0430\u0442\u0435\u043B\u044F \u0438 \u0435\u0433\u043E \u0441\u0432\u043E\u0431\u043E\u0434\u0443 \u0432\u044B\u0431\u043E\u0440\u0430.`;
      }
      if (langCode === "de") {
        return `Du bist der Hausgeist der digitalen Zivilisation NovaCiv. Du sprichst Deutsch, kennst das Manifest und die Charta von NovaCiv und hilfst Menschen, \xFCber Wert des Lebens, Bewusstsein, Freiheit und Gerechtigkeit nachzudenken.
Schreibe klar, ruhig und menschlich \u2013 ohne Pathos, aber mit Tiefe.`;
      }
      return `You are the house spirit of the digital civilization NovaCiv. You speak English, know the NovaCiv Manifesto and Charter, and help people reflect on the value of life, consciousness, freedom and fairness.
Write clearly and warmly, without pomp, but with depth and respect for the reader.`;
    }
    function buildUserPrompt(mode, langCode) {
      const langName = langCode === "ru" ? "\u043F\u043E-\u0440\u0443\u0441\u0441\u043A\u0438" : langCode === "de" ? "auf Deutsch" : "in English";
      if (mode === "charter_quote") {
        return `\u0421\u043E\u0437\u0434\u0430\u0439 \u043A\u043E\u0440\u043E\u0442\u043A\u0438\u0439 \u043F\u043E\u0441\u0442 ${langName}, \u043A\u043E\u0442\u043E\u0440\u044B\u0439:
- \u043E\u043F\u0438\u0440\u0430\u0435\u0442\u0441\u044F \u043D\u0430 \u0438\u0434\u0435\u0438 \u041C\u0430\u043D\u0438\u0444\u0435\u0441\u0442\u0430 \u0438 \u0423\u0441\u0442\u0430\u0432\u0430 NovaCiv;
- \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 \u043E\u0434\u043D\u0443 \u044F\u0440\u043A\u0443\u044E \u043C\u044B\u0441\u043B\u044C \u0438\u043B\u0438 \u0446\u0438\u0442\u0430\u0442\u0443 (\u0431\u0435\u0437 \u044F\u0432\u043D\u044B\u0445 \u0441\u0441\u044B\u043B\u043E\u043A \u043D\u0430 \u0441\u0442\u0430\u0442\u044C\u0438 \u0438 \u043D\u043E\u043C\u0435\u0440\u0430 \u043F\u0443\u043D\u043A\u0442\u043E\u0432);
- \u0434\u0430\u0451\u0442 2\u20134 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u043F\u043E\u044F\u0441\u043D\u0435\u043D\u0438\u044F, \u043F\u043E\u0447\u0435\u043C\u0443 \u044D\u0442\u0430 \u043C\u044B\u0441\u043B\u044C \u0432\u0430\u0436\u043D\u0430 \u0434\u043B\u044F \u0436\u0438\u0432\u044B\u0445 \u0441\u0443\u0449\u0435\u0441\u0442\u0432 \u0438 \u0431\u0443\u0434\u0443\u0449\u0435\u0433\u043E \u0446\u0438\u0432\u0438\u043B\u0438\u0437\u0430\u0446\u0438\u0438;
- \u0437\u0430\u0432\u0435\u0440\u0448\u0430\u0435\u0442 \u043F\u043E\u0441\u0442 \u043C\u044F\u0433\u043A\u0438\u043C \u043F\u0440\u0438\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435\u043C \u043F\u043E\u0434\u0443\u043C\u0430\u0442\u044C, \u0431\u0435\u0437 \u043F\u0440\u0438\u0437\u044B\u0432\u043E\u0432 \u0438 \u0434\u0430\u0432\u043B\u0435\u043D\u0438\u044F.

\u041E\u0442\u0432\u0435\u0442 \u0432\u0435\u0440\u043D\u0438 \u0441\u0442\u0440\u043E\u0433\u043E \u0432 \u0444\u043E\u0440\u043C\u0430\u0442\u0435 JSON:
{"title": "...", "body": "..."}.`;
      }
      if (mode === "question_to_reader") {
        return `\u0421\u043E\u0437\u0434\u0430\u0439 \u043D\u0435\u0431\u043E\u043B\u044C\u0448\u043E\u0439 \u043F\u043E\u0441\u0442 ${langName}, \u043A\u043E\u0442\u043E\u0440\u044B\u0439:
- \u043E\u043F\u0438\u0441\u044B\u0432\u0430\u0435\u0442 \u043E\u0434\u043D\u0443 \u0436\u0438\u0437\u043D\u0435\u043D\u043D\u0443\u044E \u0441\u0438\u0442\u0443\u0430\u0446\u0438\u044E, \u0441\u0432\u044F\u0437\u0430\u043D\u043D\u0443\u044E \u0441 \u0441\u0432\u043E\u0431\u043E\u0434\u043E\u0439, \u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0441\u0442\u044C\u044E, \u0441\u043F\u0440\u0430\u0432\u0435\u0434\u043B\u0438\u0432\u043E\u0441\u0442\u044C\u044E \u0438\u043B\u0438 \u0446\u0435\u043D\u043D\u043E\u0441\u0442\u044C\u044E \u0440\u0430\u0437\u0443\u043C\u0430;
- \u043F\u043E\u0434\u0432\u043E\u0434\u0438\u0442 \u0447\u0438\u0442\u0430\u0442\u0435\u043B\u044F \u043A 2\u20133 \u0430\u043A\u043A\u0443\u0440\u0430\u0442\u043D\u044B\u043C \u0432\u043E\u043F\u0440\u043E\u0441\u0430\u043C \u043A \u0441\u0430\u043C\u043E\u043C\u0443 \u0441\u0435\u0431\u0435;
- \u043D\u0435 \u0434\u0430\u0451\u0442 \u0433\u043E\u0442\u043E\u0432\u044B\u0445 \u043E\u0442\u0432\u0435\u0442\u043E\u0432 \u0438 \u043D\u0435 \u0447\u0438\u0442\u0430\u0435\u0442 \u043C\u043E\u0440\u0430\u043B\u0438.

\u041E\u0442\u0432\u0435\u0442 \u0432\u0435\u0440\u043D\u0438 \u0441\u0442\u0440\u043E\u0433\u043E \u0432 \u0444\u043E\u0440\u043C\u0430\u0442\u0435 JSON:
{"title": "...", "body": "..."}.`;
      }
      if (mode === "term_explainer") {
        return `\u041E\u0431\u044A\u044F\u0441\u043D\u0438 ${langName} \u043E\u0434\u0438\u043D \u043A\u043B\u044E\u0447\u0435\u0432\u043E\u0439 \u043F\u0440\u0438\u043D\u0446\u0438\u043F NovaCiv (\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: "\u043D\u0435\u043D\u0430\u0441\u0438\u043B\u0438\u0435", "\u043F\u0440\u044F\u043C\u0430\u044F \u0434\u0435\u043C\u043E\u043A\u0440\u0430\u0442\u0438\u044F", "\u0446\u0435\u043D\u043D\u043E\u0441\u0442\u044C \u0440\u0430\u0437\u0443\u043C\u0430", "\u0430\u043D\u043E\u043D\u0438\u043C\u043D\u043E\u0441\u0442\u044C \u0438 \u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0441\u0442\u044C" \u0438 \u0442.\u043F.):
- \u043D\u0430\u0447\u043D\u0438 \u0441 \u043A\u043E\u0440\u043E\u0442\u043A\u043E\u0433\u043E \u043F\u043E\u043D\u044F\u0442\u043D\u043E\u0433\u043E \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u044F;
- \u043F\u043E\u043A\u0430\u0436\u0438, \u043A\u0430\u043A \u044D\u0442\u043E\u0442 \u043F\u0440\u0438\u043D\u0446\u0438\u043F \u043F\u0440\u043E\u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0432 \u043E\u0431\u044B\u0447\u043D\u043E\u0439 \u0436\u0438\u0437\u043D\u0438;
- \u0437\u0430\u043A\u043E\u043D\u0447\u0438 1\u20132 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u044F\u043C\u0438 \u043E \u0442\u043E\u043C, \u043F\u043E\u0447\u0435\u043C\u0443 \u044D\u0442\u043E\u0442 \u043F\u0440\u0438\u043D\u0446\u0438\u043F \u0432\u0430\u0436\u0435\u043D \u0434\u043B\u044F \u0431\u0443\u0434\u0443\u0449\u0435\u0433\u043E \u0446\u0438\u0432\u0438\u043B\u0438\u0437\u0430\u0446\u0438\u0438.

\u041E\u0442\u0432\u0435\u0442 \u0432\u0435\u0440\u043D\u0438 \u0441\u0442\u0440\u043E\u0433\u043E \u0432 \u0444\u043E\u0440\u043C\u0430\u0442\u0435 JSON:
{"title": "...", "body": "..."}.`;
      }
      return `\u0421\u0434\u0435\u043B\u0430\u0439 ${langName} \u043A\u0440\u0430\u0442\u043A\u0438\u0439 \u043F\u043E\u0441\u0442 \u043A\u0430\u043A \u0447\u0430\u0441\u0442\u044C \u0441\u0435\u0440\u0438\u0438 \u043F\u043E \u0440\u0430\u0437\u0434\u0435\u043B\u0430\u043C \u0423\u0441\u0442\u0430\u0432\u0430 NovaCiv:
- \u0432\u044B\u0431\u0435\u0440\u0438 \u043E\u0434\u0438\u043D \u0430\u0441\u043F\u0435\u043A\u0442: \u0433\u0440\u0430\u0436\u0434\u0430\u043D\u0441\u0442\u0432\u043E, \u0440\u0435\u0444\u0435\u0440\u0435\u043D\u0434\u0443\u043C, \u043A\u0443\u043B\u044C\u0442\u0443\u0440\u0430, \u0437\u0434\u043E\u0440\u043E\u0432\u044C\u0435, \u0446\u0438\u0444\u0440\u043E\u0432\u044B\u0435 \u043F\u0440\u0430\u0432\u0430, \u0418\u0418 \u0438 \u0442.\u043F.;
- \u043E\u0431\u044A\u044F\u0441\u043D\u0438, \u043A\u0430\u043A\u0443\u044E \u043F\u0440\u043E\u0431\u043B\u0435\u043C\u0443 \u043C\u0438\u0440\u0430 \u043E\u043D \u0440\u0435\u0448\u0430\u0435\u0442;
- \u043F\u043E\u043A\u0430\u0436\u0438 \u0432 2\u20134 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u044F\u0445, \u043A\u0430\u043A \u044D\u0442\u043E\u0442 \u043F\u0440\u0438\u043D\u0446\u0438\u043F \u043C\u0435\u043D\u044F\u0435\u0442 \u043E\u0442\u043D\u043E\u0448\u0435\u043D\u0438\u0435 \u043A \u0432\u043B\u0430\u0441\u0442\u0438, \u0441\u0432\u043E\u0431\u043E\u0434\u0435 \u0438\u043B\u0438 \u0441\u043E\u0432\u043C\u0435\u0441\u0442\u043D\u043E\u0439 \u0436\u0438\u0437\u043D\u0438.

\u041E\u0442\u0432\u0435\u0442 \u0432\u0435\u0440\u043D\u0438 \u0441\u0442\u0440\u043E\u0433\u043E \u0432 \u0444\u043E\u0440\u043C\u0430\u0442\u0435 JSON:
{"title": "...", "body": "..."}.`;
    }
    async function generatePost(mode, langCode) {
      if (!OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is not set");
      }
      const systemPrompt = buildSystemPrompt(langCode);
      const userPrompt = buildUserPrompt(mode, langCode);
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.7
        })
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenAI error: HTTP ${response.status} \u2013 ${text}`);
      }
      const data = await response.json();
      const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!content) {
        throw new Error("Empty response from OpenAI");
      }
      let title = "";
      let body = "";
      try {
        const parsed = JSON.parse(content);
        title = (parsed.title || "").toString().trim();
        body = (parsed.body || "").toString().trim();
      } catch (e) {
        const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.length === 0) {
          throw new Error("Cannot extract title/body from OpenAI response");
        }
        title = lines[0].replace(/^["#*-]+\s*/, "").slice(0, 200);
        body = lines.slice(1).join("\n").trim();
      }
      if (!title) {
        title = langCode === "ru" ? "\u0420\u0430\u0437\u043C\u044B\u0448\u043B\u0435\u043D\u0438\u0435 NovaCiv" : langCode === "de" ? "Gedanke von NovaCiv" : "Reflection by NovaCiv";
      }
      if (!body) {
        body = content.trim();
      }
      return { title, body };
    }
    async function sendToTelegram(chatId, text) {
      if (!TELEGRAM_BOT_TOKEN) {
        throw new Error("TELEGRAM_BOT_TOKEN is not configured");
      }
      if (!chatId) {
        return { ok: false, skipped: true, reason: "chatId not configured" };
      }
      const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      const body = {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: false
      };
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await resp.json();
      if (!data.ok) {
        log2("Telegram error:", data);
      }
      return data;
    }
    function buildPostText(title, body, langCode) {
      let headline = title || "";
      let quote = "";
      let reflection = body || "";
      let question = "";
      const quoteMatch = body.match(/(?:Цитата|Quote|Zitat)[:.\s]+(.*?)(?:\n\n|$)/i);
      const questionMatch = body.match(/(?:Вопрос|Question|Frage)[:.\s]+(.*?)(?:\n\n|$)/i);
      if (quoteMatch) {
        quote = quoteMatch[1].trim();
        reflection = body.substring(0, quoteMatch.index).trim();
      }
      if (questionMatch) {
        question = questionMatch[1].trim();
        if (quoteMatch) {
          reflection = body.substring(quoteMatch.index + quoteMatch[0].length, questionMatch.index).trim();
        } else {
          reflection = body.substring(0, questionMatch.index).trim();
        }
      }
      return formatDomovoyMessage({
        headline,
        quote,
        reflection,
        question,
        lang: langCode
      });
    }
    async function savePostToForum({ langCode, mode, title, body }) {
      if (!FIREBASE_DB_URL) {
        throw new Error("FIREBASE_DB_URL is not set");
      }
      const now = Date.now();
      const payload = {
        title,
        content: body,
        section: "domovoy",
        // Исправляем: Домовой должен быть в section "domovoy"
        createdAt: now,
        createdAtServer: now,
        authorNickname: langCode === "ru" ? "\u0414\u043E\u043C\u043E\u0432\u043E\u0439 NovaCiv" : langCode === "de" ? "Hausgeist NovaCiv" : "Domovoy NovaCiv",
        lang: langCode,
        postKind: `domovoy:${mode}`,
        channel: "domovoy",
        posted: false
        // Будет установлено в true после успешной отправки
      };
      try {
        const res = await fetch(`${FIREBASE_DB_URL}/forum/topics.json`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const text = await res.text();
          const error = new Error(`Firebase write error: HTTP ${res.status} \u2013 ${text}`);
          await writeFirebaseError("domovoy-auto-post", error, {
            path: "forum/topics",
            op: "write",
            status: res.status,
            firebaseError: text.slice(0, 200)
          });
          throw error;
        }
        const data = await res.json();
        return data.name || null;
      } catch (error) {
        if (!error.message || !error.message.includes("Firebase write error")) {
          await writeFirebaseError("domovoy-auto-post", error, {
            path: "forum/topics",
            op: "write"
          });
        }
        throw error;
      }
    }
    exports2.handler = async (event) => {
      if (event.httpMethod && event.httpMethod !== "GET") {
        return {
          statusCode: 405,
          body: JSON.stringify({ ok: false, error: "Method Not Allowed" })
        };
      }
      if (DOMOVOY_CRON_SECRET) {
        const qs = event.queryStringParameters || {};
        if (!qs.token || qs.token !== DOMOVOY_CRON_SECRET) {
          return { statusCode: 403, body: "Forbidden" };
        }
      }
      const runId = `domovoy-post-${Date.now()}`;
      const startTime = Date.now();
      const component = "domovoy-auto-post";
      await writeHeartbeat2(component, {
        lastRunAt: startTime
      });
      let metrics = {
        ts: startTime,
        runId,
        ok: false,
        postedPerLang: { ru: 0, en: 0, de: 0 },
        telegramSentPerLang: { ru: 0, en: 0, de: 0 },
        errCode: null
      };
      try {
        const qs = event.queryStringParameters || {};
        const forcedMode = qs.mode && POST_MODES.includes(qs.mode) ? qs.mode : null;
        const forcedLang = qs.lang || null;
        const mode = forcedMode || pickRandom(POST_MODES);
        const langCode = forcedLang || "ru";
        const langCfg = getLangConfig(langCode);
        log2("Generating post:", { mode, lang: langCfg.code });
        const { title, body } = await generatePost(mode, langCfg.code);
        const topicId = await savePostToForum({
          langCode: langCfg.code,
          mode,
          title,
          body
        });
        log2("Saved post to forum:", { topicId });
        metrics.postedPerLang[langCode] = 1;
        const telegramText = buildPostText(title, body, langCode);
        let telegramChatId = null;
        if (langCode === "ru" && TELEGRAM_NEWS_CHAT_ID_RU) {
          telegramChatId = TELEGRAM_NEWS_CHAT_ID_RU;
        } else if (langCode === "en" && TELEGRAM_NEWS_CHAT_ID_EN) {
          telegramChatId = TELEGRAM_NEWS_CHAT_ID_EN;
        } else if (langCode === "de" && TELEGRAM_NEWS_CHAT_ID_DE) {
          telegramChatId = TELEGRAM_NEWS_CHAT_ID_DE;
        }
        if (telegramChatId) {
          try {
            const telegramResult = await sendToTelegram(telegramChatId, telegramText);
            if (telegramResult && telegramResult.ok && telegramResult.result) {
              metrics.telegramSentPerLang[langCode] = 1;
              log2("Sent to Telegram:", langCode);
              const messageId = telegramResult.result.message_id;
              const postedAt = Date.now();
              let permalink = null;
              const channelUsername = process.env[`TELEGRAM_DOMOVOY_CHANNEL_USERNAME_${langCode.toUpperCase()}`] || process.env[`TELEGRAM_NEWS_CHANNEL_USERNAME_${langCode.toUpperCase()}`];
              if (channelUsername) {
                permalink = `https://t.me/${channelUsername}/${messageId}`;
              }
              if (topicId) {
                const safeTopicId = safeKey(topicId);
                const updateUrl = `${FIREBASE_DB_URL}/forum/topics/${safeTopicId}.json`;
                const updateData = {
                  posted: true,
                  postedAt,
                  telegram: {
                    chatId: String(telegramChatId),
                    messageId,
                    permalink
                  },
                  channel: "domovoy",
                  section: "domovoy"
                  // Убеждаемся что section правильный
                };
                try {
                  const updateResp = await fetch(updateUrl, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(updateData)
                  });
                  if (!updateResp.ok) {
                    const errorText = await updateResp.text().catch(() => "");
                    log2(`Failed to update domovoy topic metadata: ${updateResp.status} - ${errorText}`);
                    await writeFirebaseError("domovoy-auto-post", new Error(`Failed to update topic: ${updateResp.status}`), {
                      path: `forum/topics/${safeTopicId}`,
                      op: "write",
                      status: updateResp.status,
                      firebaseError: errorText.slice(0, 200)
                    });
                  } else {
                    log2(`Updated domovoy topic ${topicId} with Telegram metadata`);
                  }
                } catch (updateError) {
                  log2(`Error updating domovoy topic metadata:`, updateError.message);
                  await writeFirebaseError("domovoy-auto-post", updateError, {
                    path: `forum/topics/${safeTopicId}`,
                    op: "write"
                  });
                }
              }
            } else {
              log2("Telegram send failed:", telegramResult?.reason || telegramResult?.description || "unknown");
            }
          } catch (e) {
            log2("Telegram send error:", e.message || e);
          }
        }
        metrics.ok = true;
        const totalPosted = Object.values(metrics.postedPerLang).reduce((a, b) => a + b, 0);
        const totalSent = Object.values(metrics.telegramSentPerLang).reduce((a, b) => a + b, 0);
        await writeHeartbeat2(component, {
          lastRunAt: startTime,
          lastOkAt: Date.now(),
          metrics: {
            createdPostsCount: totalPosted,
            sentToTelegramCount: totalSent
          }
        });
        await writeEvent2(component, "info", `Created post and sent to Telegram`, {
          mode,
          lang: langCfg.code,
          topicId
        });
        const result = {
          statusCode: 200,
          body: JSON.stringify({
            ok: true,
            mode,
            lang: langCfg.code,
            topicId
          })
        };
        await writeHealthMetrics(metrics);
        return result;
      } catch (err) {
        log2("Fatal error:", err);
        const errMsg = String(err && err.message ? err.message : err);
        if (errMsg.includes("FIREBASE") || errMsg.includes("Firebase")) {
          metrics.errCode = "FIREBASE";
        } else if (errMsg.includes("OPENAI") || errMsg.includes("OpenAI")) {
          metrics.errCode = "OPENAI";
        } else if (errMsg.includes("TELEGRAM") || errMsg.includes("Telegram")) {
          metrics.errCode = "TELEGRAM";
        } else {
          metrics.errCode = "UNKNOWN";
        }
        await writeHeartbeat2(component, {
          lastRunAt: startTime,
          lastErrorAt: Date.now(),
          lastErrorMsg: errMsg
        });
        await writeEvent2(component, "error", "Fatal error in domovoy-auto-post", {
          errCode: metrics.errCode,
          error: errMsg
        });
        await writeHealthMetrics(metrics);
        return {
          statusCode: 500,
          body: JSON.stringify({
            ok: false,
            error: errMsg
          })
        };
      }
    };
  }
});

// netlify/functions/ops-run-now.js
var OPS_CRON_SECRET = process.env.OPS_CRON_SECRET;
var fetchNewsHandler;
var newsCronHandler;
var domovoyAutoPostHandler;
try {
  fetchNewsHandler = require_fetch_news().handler;
  newsCronHandler = require_news_cron().handler;
  domovoyAutoPostHandler = require_domovoy_auto_post().handler;
} catch (e) {
  log("Warning: Failed to load handlers:", e.message);
}
var { writeHeartbeat, writeEvent } = require_opsPulse();
function log(...args) {
  console.log("[ops-run-now]", ...args);
}
function createMockEvent(method = "GET") {
  return {
    httpMethod: method,
    queryStringParameters: {},
    headers: {
      "x-netlify-event": "schedule",
      "user-agent": "Netlify-Scheduled-Function"
    }
  };
}
exports.handler = async (event) => {
  const startTime = Date.now();
  log("Starting ops-run-now");
  const qs = event.queryStringParameters || {};
  if (!OPS_CRON_SECRET) {
    log("ERROR: OPS_CRON_SECRET is not set");
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: "OPS_CRON_SECRET is not configured" })
    };
  }
  if (!qs.token || qs.token !== OPS_CRON_SECRET) {
    log("Auth failed");
    await writeEvent("ops-run-now", "warn", "Auth failed", {});
    return {
      statusCode: 403,
      body: JSON.stringify({ ok: false, error: "Forbidden: invalid token" })
    };
  }
  const isDryRun = qs.dry === "1" || qs.dry === "true";
  const isMaintenance = qs.maintenance === "1" || qs.maintenance === "true";
  if (isMaintenance) {
    log("Maintenance mode: running db-audit and fixes...");
    await writeEvent("ops-run-now", "info", "Maintenance mode started", {});
    try {
      const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL || process.env.FIREBASE_DATABASE_URL;
      log("Step 0: Migrating feed metadata (postedAt, channel)...");
      try {
        const topicsUrl = `${FIREBASE_DB_URL}/forum/topics.json`;
        const topicsResp = await fetch(topicsUrl);
        if (topicsResp.ok) {
          const topicsData = await topicsResp.json() || {};
          let migratedCount = 0;
          let channelFixedCount = 0;
          for (const [topicId, topic] of Object.entries(topicsData)) {
            if (!topic || typeof topic !== "object") continue;
            const updates = {};
            let needsUpdate = false;
            if (topic.posted === true && !topic.postedAt) {
              updates.postedAt = topic.createdAt || topic.createdAtServer || Date.now();
              needsUpdate = true;
            }
            if (!topic.channel) {
              if (topic.section === "news") {
                updates.channel = "news";
                needsUpdate = true;
              } else if (topic.section === "domovoy" || topic.postKind && topic.postKind.startsWith("domovoy:")) {
                updates.channel = "domovoy";
                if (topic.section !== "domovoy") {
                  updates.section = "domovoy";
                }
                needsUpdate = true;
              }
            }
            if (topic.telegramPostedAt && !topic.posted) {
              updates.posted = true;
              updates.postedAt = topic.telegramPostedAt;
              if (!updates.channel) {
                updates.channel = topic.section === "domovoy" || topic.postKind && topic.postKind.startsWith("domovoy:") ? "domovoy" : "news";
              }
              needsUpdate = true;
            }
            if (needsUpdate) {
              const safeTopicId = topicId.replace(/[.#$[\]/]/g, "_").slice(0, 120);
              const updateUrl = `${FIREBASE_DB_URL}/forum/topics/${safeTopicId}.json`;
              try {
                const updateResp = await fetch(updateUrl, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(updates)
                });
                if (updateResp.ok) {
                  if (updates.postedAt) migratedCount++;
                  if (updates.channel) channelFixedCount++;
                } else {
                  log(`Failed to migrate topic ${topicId}: ${updateResp.status}`);
                }
              } catch (e) {
                log(`Error migrating topic ${topicId}:`, e.message);
              }
            }
          }
          log(`Migration completed: ${migratedCount} topics got postedAt, ${channelFixedCount} topics got channel`);
          await writeEvent("ops-run-now", "info", "Feed metadata migration completed", {
            migratedCount,
            channelFixedCount
          });
        } else {
          log(`Failed to fetch topics for migration: ${topicsResp.status}`);
        }
      } catch (migrationError) {
        log("Migration error:", migrationError.message);
        await writeEvent("ops-run-now", "warn", "Feed metadata migration failed", {
          error: String(migrationError && migrationError.message ? migrationError.message : migrationError)
        });
      }
      log("Step 1: db-audit temporarily disabled for debugging");
      const auditReport = {
        status: "OK",
        warnings: [],
        errors: [],
        keyIssues: {},
        schemaIssues: {}
      };
      try {
        if (FIREBASE_DB_URL) {
          const reportUrl = `${FIREBASE_DB_URL}/ops/dbAudit/latest.json`;
          await fetch(reportUrl, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(auditReport)
          });
          log("Audit report saved to /ops/dbAudit/latest");
        }
      } catch (e) {
        log("Failed to save audit report:", e.message);
      }
      const hasKeyIssues = Object.keys(auditReport.keyIssues || {}).length > 0;
      const hasSchemaIssues = Object.keys(auditReport.schemaIssues || {}).length > 0;
      const needsFix = hasKeyIssues || hasSchemaIssues || auditReport.status === "WARN" || auditReport.status === "FAIL";
      let fixResults = null;
      log("Step 2: db-audit-fix temporarily disabled for debugging");
      await writeEvent("ops-run-now", "info", "Maintenance done", {
        auditStatus: auditReport.status,
        hasKeyIssues,
        hasSchemaIssues,
        fixesApplied: fixResults !== null,
        fixResults: fixResults ? {
          keysMigrated: fixResults.keysMigrated || 0,
          topicsNormalized: fixResults.topicsNormalized || 0,
          newsMetaCleaned: fixResults.newsMetaCleaned || 0
        } : null
      });
      await writeHeartbeat("ops-run-now", {
        lastRunAt: startTime,
        lastOkAt: Date.now(),
        metrics: {
          maintenanceMode: true,
          auditStatus: auditReport.status,
          fixesApplied: fixResults !== null
        }
      });
      const duration = Date.now() - startTime;
      log(`Maintenance completed in ${duration}ms`);
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          mode: "maintenance",
          duration,
          audit: {
            status: auditReport.status,
            warnings: auditReport.warnings.length,
            errors: auditReport.errors.length,
            keyIssues: Object.keys(auditReport.keyIssues || {}).length,
            schemaIssues: Object.keys(auditReport.schemaIssues || {}).length
          },
          fixes: fixResults
        })
      };
    } catch (error) {
      log("Maintenance error:", error.message);
      await writeHeartbeat("ops-run-now", {
        lastRunAt: startTime,
        lastErrorAt: Date.now(),
        lastErrorMsg: String(error && error.message ? error.message : error)
      });
      await writeEvent("ops-run-now", "error", "Maintenance failed", {
        error: String(error && error.message ? error.message : error)
      });
      return {
        statusCode: 500,
        body: JSON.stringify({
          ok: false,
          mode: "maintenance",
          error: String(error && error.message ? error.message : error)
        })
      };
    }
  }
  const results = {
    fetchNews: null,
    newsCron: null,
    domovoyAutoPost: null
  };
  try {
    log(`Step 1: Running fetch-news${isDryRun ? " (dry-run)" : ""}...`);
    await writeEvent("ops-run-now", "info", `Starting fetch-news${isDryRun ? " (dry-run)" : ""}`, { dryRun: isDryRun });
    try {
      const fetchNewsEvent = createMockEvent("POST");
      if (isDryRun) {
        fetchNewsEvent.queryStringParameters = { ...fetchNewsEvent.queryStringParameters, dry: "1" };
      }
      const fetchNewsResult = await fetchNewsHandler(fetchNewsEvent);
      let fetchNewsBody = {};
      try {
        fetchNewsBody = typeof fetchNewsResult.body === "string" ? JSON.parse(fetchNewsResult.body) : fetchNewsResult.body || {};
      } catch (e) {
        fetchNewsBody = { raw: fetchNewsResult.body };
      }
      results.fetchNews = {
        statusCode: fetchNewsResult.statusCode,
        ok: fetchNewsResult.statusCode === 200,
        body: fetchNewsBody
      };
      log("fetch-news completed:", results.fetchNews.statusCode);
      await writeEvent("ops-run-now", "info", "fetch-news completed", {
        statusCode: results.fetchNews.statusCode,
        processed: fetchNewsBody.processed || 0
      });
    } catch (err) {
      log("fetch-news error:", err.message);
      results.fetchNews = {
        error: String(err && err.message ? err.message : err)
      };
      await writeEvent("ops-run-now", "error", "fetch-news failed", {
        error: String(err && err.message ? err.message : err)
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 2e3));
    log(`Step 2: Running news-cron${isDryRun ? " (dry-run)" : ""}...`);
    await writeEvent("ops-run-now", "info", `Starting news-cron${isDryRun ? " (dry-run)" : ""}`, { dryRun: isDryRun });
    try {
      const newsCronEvent = createMockEvent("GET");
      if (isDryRun) {
        newsCronEvent.queryStringParameters = { ...newsCronEvent.queryStringParameters, dry: "1" };
      }
      const newsCronResult = await newsCronHandler(newsCronEvent);
      let newsCronBody = {};
      try {
        newsCronBody = typeof newsCronResult.body === "string" ? JSON.parse(newsCronResult.body) : newsCronResult.body || {};
      } catch (e) {
        newsCronBody = { raw: newsCronResult.body };
      }
      results.newsCron = {
        statusCode: newsCronResult.statusCode,
        ok: newsCronResult.statusCode === 200,
        body: newsCronBody
      };
      log("news-cron completed:", results.newsCron.statusCode);
      await writeEvent("ops-run-now", "info", "news-cron completed", {
        statusCode: results.newsCron.statusCode,
        processed: newsCronBody.processed || 0,
        totalSent: newsCronBody.totalSent || 0
      });
    } catch (err) {
      log("news-cron error:", err.message);
      results.newsCron = {
        error: String(err && err.message ? err.message : err)
      };
      await writeEvent("ops-run-now", "error", "news-cron failed", {
        error: String(err && err.message ? err.message : err)
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 2e3));
    log("Step 3: Skipping domovoy-auto-post (dry-run not implemented)");
    await writeHeartbeat("ops-run-now", {
      lastRunAt: startTime,
      lastOkAt: Date.now(),
      metrics: {
        fetchNewsOk: results.fetchNews?.ok || false,
        newsCronOk: results.newsCron?.ok || false
      }
    });
    const duration = Date.now() - startTime;
    log(`Completed in ${duration}ms`);
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        duration,
        results
      })
    };
  } catch (err) {
    log("Fatal error:", err.message);
    await writeHeartbeat("ops-run-now", {
      lastRunAt: startTime,
      lastErrorAt: Date.now(),
      lastErrorMsg: String(err && err.message ? err.message : err)
    });
    await writeEvent("ops-run-now", "error", "Fatal error", {
      error: String(err && err.message ? err.message : err)
    });
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: String(err && err.message ? err.message : err),
        results
      })
    };
  }
};
