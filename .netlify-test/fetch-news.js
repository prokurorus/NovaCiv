// Bundled by esbuild
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// netlify/lib/opsPulse.js
var require_opsPulse = __commonJS({
  "netlify/lib/opsPulse.js"(exports2, module2) {
    var FIREBASE_DB_URL2 = process.env.FIREBASE_DB_URL;
    var MAX_EVENTS = 20;
    function sanitizeString(str) {
      if (!str) return str;
      return String(str).replace(/sk-[a-zA-Z0-9]+/g, "sk-***").replace(/ghp_[a-zA-Z0-9]+/g, "ghp_***").replace(/AIza[^"'\s]+/g, "AIza***").replace(/-----BEGIN[^-]+-----END[^-]+-----/gs, "***PRIVATE_KEY***").replace(/["']([^"']*token[^"']*)["']/gi, '"***TOKEN***"');
    }
    async function writeHeartbeat2(component, status) {
      if (!FIREBASE_DB_URL2) return;
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
        const url = `${FIREBASE_DB_URL2}/ops/heartbeat/${component}.json`;
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
      if (!FIREBASE_DB_URL2) return;
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
        const eventsUrl = `${FIREBASE_DB_URL2}/ops/events.json`;
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
    async function writeFirebaseError2(component, error, meta = {}) {
      if (!FIREBASE_DB_URL2) return;
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
      writeFirebaseError: writeFirebaseError2
    };
  }
});

// netlify/lib/rssSourcesByLang.js
var require_rssSourcesByLang = __commonJS({
  "netlify/lib/rssSourcesByLang.js"(exports2, module2) {
    var RSS_SOURCES2 = {
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
      RSS_SOURCES: RSS_SOURCES2
    };
  }
});

// netlify/functions/fetch-news.js
var OPENAI_API_KEY = process.env.OPENAI_API_KEY;
var FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;
var NEWS_CRON_SECRET = process.env.NEWS_CRON_SECRET;
var { writeHeartbeat, writeEvent, writeFirebaseError } = require_opsPulse();
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
  const res = await fetch(sourceUrl);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `RSS fetch failed for ${sourceName}: HTTP ${res.status} \u2013 ${text}`
    );
  }
  const xml = await res.text();
  const sourceId = safeKey(sourceName);
  const items = parseRss(xml, sourceId, [sourceLang]);
  return items;
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
exports.handler = async (event) => {
  console.log("fetch-news start");
  const startTime = Date.now();
  const component = "fetch-news";
  await writeHeartbeat(component, {
    lastRunAt: startTime
  });
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    await writeEvent(component, "warn", "Invalid HTTP method", { method: event.httpMethod });
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
    const qs = event.queryStringParameters || {};
    if (NEWS_CRON_SECRET) {
      if (!qs.token || qs.token !== NEWS_CRON_SECRET) {
        console.log("auth gate blocked (no token or token mismatch)");
        return {
          statusCode: 403,
          body: JSON.stringify({ ok: false, error: "Forbidden: invalid token" })
        };
      }
    }
    console.log("auth gate passed");
  }
  if (!OPENAI_API_KEY || !FIREBASE_DB_URL) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: false,
        error: "OPENAI_API_KEY \u0438\u043B\u0438 FIREBASE_DB_URL \u043D\u0435 \u0437\u0430\u0434\u0430\u043D\u044B \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435."
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
        await writeEvent(component, "info", `prepared news for ${lang}`, {
          lang,
          score: best.score,
          quality: best.quality
        });
      } catch (err) {
        console.error(`[fetch-news] Failed to save ${lang} news:`, err.message);
        await writeEvent(component, "error", `Failed to save news for ${lang}`, {
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
                  await writeEvent(component, "warn", `fallback used for ${lang}`, { lang, sourceLang: "en" });
                }
              }
            }
          }
        } catch (err) {
          console.error(`[fetch-news] Fallback failed for ${lang}:`, err.message);
        }
      }
    }
    await writeHeartbeat(component, {
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
    const errorMsg = String(err && err.message ? err.message : err);
    await writeHeartbeat(component, {
      lastRunAt: startTime,
      lastErrorAt: Date.now(),
      lastErrorMsg: errorMsg
    });
    await writeEvent(component, "error", "Fatal error in fetch-news", {
      error: errorMsg
    });
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: errorMsg
      })
    };
  }
};
