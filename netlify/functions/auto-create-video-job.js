// netlify/functions/auto-create-video-job.js

const admin = require("firebase-admin");

let initialized = false;

function initFirebase() {
  if (!initialized) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set");
    }

    const serviceAccount = JSON.parse(serviceAccountJson);

    const dbUrl =
      process.env.FIREBASE_DB_URL || process.env.FIREBASE_DATABASE_URL;
    if (!dbUrl) {
      throw new Error(
        "FIREBASE_DB_URL или FIREBASE_DATABASE_URL не задана (Firebase Realtime DB URL)"
      );
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: dbUrl,
    });

    initialized = true;
  }
  return admin.database();
}

const LANGS = ["en", "ru", "de", "es"];

// тексты можно потом заменить на цитаты из Устава/Манифеста
function getScriptForLanguage(lang) {
  switch (lang) {
    case "ru":
      return (
        "NovaCiv — цифровая цивилизация без правителей. " +
        "Все решения принимают сами граждане. " +
        "Зайди на novaciv.space и подпишись на будущее планеты."
      );
    case "en":
      return (
        "NovaCiv is a digital civilization without rulers. " +
        "Decisions are made openly by the citizens themselves. " +
        "Visit novaciv.space and subscribe to the future of the planet."
      );
    case "de":
      return (
        "NovaCiv ist eine digitale Zivilisation ohne Herrscher. " +
        "Alle Entscheidungen treffen die Bürger offen und transparent. " +
        "Besuche novaciv.space und abonniere die Zukunft des Planeten."
      );
    case "es":
      return (
        "NovaCiv es una civilización digital sin gobernantes. " +
        "Todas las decisiones las toman abiertamente los propios ciudadanos. " +
        "Entra en novaciv.space y suscríbete al futuro del planeta."
      );
    default:
      return "NovaCiv — the new civilization.";
  }
}

exports.handler = async () => {
  try {
    const db = initFirebase();
    const ref = db.ref("videoJobs");

    const now = Date.now();
    const created = [];

    for (const lang of LANGS) {
      const script = getScriptForLanguage(lang);
      const newRef = ref.push();

      await newRef.set({
        language: lang,
        script,
        status: "pending",
        targets: ["telegram", "youtube"],
        createdAt: now,
      });

      created.push({ id: newRef.key, lang });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, created }),
    };
  } catch (e) {
    console.error("auto-create-video-job error:", e);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e.message }),
    };
  }
};
