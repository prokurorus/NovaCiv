// netlify/lib/rssSourcesByLang.js
//
// RSS источники новостей по языкам
// Стратегия устойчивости:
// - без дублей
// - микс агентств / общественных / технологий / науки / прав
// - больше источников с высокой доступностью (меньше 403/JS-wall)

const RSS_SOURCES = {
  ru: [
    // International in RU
    { name: "BBC Russian", url: "https://www.bbc.com/russian/index.xml" },
    { name: "DW Russian", url: "https://www.dw.com/ru/rss/rss-ru-all" },

    // Major RU media (usually stable RSS)
    { name: "РБК", url: "https://www.rbc.ru/rbcfreenews.rss" },
    { name: "Коммерсант", url: "https://www.kommersant.ru/RSS/news.xml" },
    { name: "Интерфакс", url: "https://www.interfax.ru/rss.asp" },
    { name: "ТАСС", url: "https://tass.ru/rss/v2.xml" },
    { name: "РИА Новости", url: "https://ria.ru/export/rss2/index.xml" },
    { name: "Российская газета", url: "https://rg.ru/xml/index.xml" },
    { name: "МК", url: "https://www.mk.ru/rss/index.xml" },
    { name: "Независимая газета", url: "https://www.ng.ru/rss/" },
    { name: "Газета.ру", url: "https://www.gazeta.ru/export/rss/lenta.xml" },
    { name: "Lenta.ru", url: "https://lenta.ru/rss" },

    // Business / tech / science in RU
    { name: "Forbes Russia", url: "https://www.forbes.ru/rss.xml" },

    // Meduza often stable but can be blocked in some regions; keep (self-heal will quarantine if fails)
    { name: "Meduza", url: "https://meduza.io/rss/all" },

    // Optional controversial / sometimes unstable feeds (kept, self-heal will quarantine)
    { name: "The Insider", url: "https://theins.ru/rss/all.xml" },
    { name: "Republic", url: "https://republic.ru/rss/all.xml" },
    { name: "Новая газета", url: "https://novayagazeta.ru/rss" },
    { name: "Радио Свобода", url: "https://www.svoboda.org/api/zrqitewimt" },

    // Remove dead / legacy:
    // Echo Moscow removed (no longer reliably active)
  ],

  en: [
    // BBC / DW / Guardian (stable RSS)
    { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
    { name: "BBC Top", url: "https://feeds.bbci.co.uk/news/rss.xml" },
    { name: "DW World", url: "https://rss.dw.com/rdf/rss-en-all" },
    { name: "The Guardian World", url: "https://www.theguardian.com/world/rss" },
    { name: "The Guardian UK", url: "https://www.theguardian.com/uk/rss" },

    // Public broadcasters / reliable
    { name: "NPR News", url: "https://feeds.npr.org/1001/rss.xml" },
    { name: "NPR World", url: "https://feeds.npr.org/1004/rss.xml" },
    { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },

    // Newspapers (RSS)
    { name: "NYT World", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
    { name: "NYT Home", url: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml" },

    // Politics / analysis
    { name: "Politico Picks", url: "https://www.politico.com/rss/politicopicks.xml" },
    { name: "The Hill", url: "https://thehill.com/rss/syndicator/19110" },
    { name: "Axios", url: "https://www.axios.com/feed/all.xml" },

    // Tech / science (stable)
    { name: "Wired", url: "https://www.wired.com/feed/rss" },
    { name: "TechCrunch", url: "https://techcrunch.com/feed/" },
    { name: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
    { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },
    { name: "MIT Technology Review", url: "https://www.technologyreview.com/feed/" },
    { name: "Nature", url: "https://www.nature.com/nature.rss" },

    // Human rights / institutions
    { name: "UN News", url: "https://news.un.org/feed/" },
    { name: "Human Rights Watch", url: "https://www.hrw.org/rss" },
    { name: "Amnesty", url: "https://www.amnesty.org/en/rss/" },
    { name: "RSF", url: "https://rsf.org/en/rss" },

    // Europe
    { name: "Euronews", url: "https://www.euronews.com/rss?format=mrss" },
    { name: "EUobserver", url: "https://euobserver.com/rss" },

    // NOTE:
    // Reuters/AP/WaPo/FT/Economist often break due to paywall/anti-bot/not-rss endpoints.
    // If you really want them, we can add only verified RSS endpoints later.
  ],

  de: [
    // Public / major
    { name: "Tagesschau", url: "https://www.tagesschau.de/xml/rss2" },
    { name: "DW Deutsch", url: "https://rss.dw.com/rdf/rss-de-all" },
    { name: "ZDF", url: "https://www.zdf.de/rss/zdf/nachrichten" },
    { name: "ARD", url: "https://www.ard.de/home/ard/ARD_Startseite_Neu_100~rss.xml" },
    { name: "ORF", url: "https://orf.at/stories/s/index.rss" },

    // Press
    { name: "Der Spiegel", url: "https://www.spiegel.de/schlagzeilen/index.rss" },
    { name: "Die Zeit", url: "https://newsfeed.zeit.de/index" },
    { name: "Sueddeutsche", url: "https://www.sueddeutsche.de/rss" },
    { name: "FAZ Aktuell", url: "https://www.faz.net/rss/aktuell/" },
    { name: "Die Welt", url: "https://www.welt.de/feeds/section/home.rss" },
    { name: "taz", url: "https://taz.de/!p4606;rss/" },

    // DACH
    { name: "NZZ International", url: "https://www.nzz.ch/international.rss" },
    { name: "Der Standard", url: "https://www.derstandard.at/rss" },

    // Tech / rights
    { name: "Heise", url: "https://www.heise.de/rss/heise.rdf" },
    { name: "Golem", url: "https://www.golem.de/rss" },
    { name: "Netzpolitik", url: "https://netzpolitik.org/feed/" },

    // Economy
    { name: "Handelsblatt", url: "https://www.handelsblatt.com/contentexport/feed/schlagzeilen" },
    { name: "WiWo", url: "https://www.wiwo.de/contentexport/feed/rss" },

    // Optional (sometimes noisy)
    { name: "Stern", url: "https://www.stern.de/feed/standard/alle-nachrichten/" },
    { name: "Focus", url: "https://www.focus.de/feed/rss" },
  ],
};

module.exports = { RSS_SOURCES };
