// netlify/functions/create-video-job.js

const admin = require("firebase-admin");

let initialized = false;

function initFirebase() {
  if (!initialized) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set");
    }

    const serviceAccount = JSON.parse(serviceAccountJson);

    const databaseURL =
      process.env.FIREBASE_DB_URL ||
      process.env.FIREBASE_DATABASE_URL ||
      "https://novaciv-web-default-rtdb.europe-west1.firebasedatabase.app";

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL,
    });

    initialized = true;
  }
}

// порядок языков для циклической генерации
const LANGUAGE_ORDER = ["ru", "en", "de", "es"];

// текстовые шаблоны для роликов на разных языках
const JOB_TEMPLATES = {
  ru: {
    topic: "Первое знакомство с NovaCiv",
    script: `
Представь себе цивилизацию, где нет правителей и закрытых кабинетов.
Все решения принимают сами граждане — открыто и прозрачно.

NovaCiv — это цифровая платформа, которую мы строим вместе,
чтобы вернуть людям право решать свою судьбу без посредников.

Если тебе откликается эта идея —
зайди на novaciv точка space
и подпишись на будущее планеты.
    `.trim(),
    prompt:
      "Ultra minimalistic white-on-white bas-relief of a digital civilization, abstract silhouettes of people and network lines, soft camera moves, calm but serious mood, vertical 9:16, loopable background for Russian philosophical voiceover.",
    preset: "short_auto_citation",
  },

  en: {
    topic: "First contact with NovaCiv",
    script: `
Imagine a civilization with no rulers and no closed rooms.
Where every decision is made openly by the citizens themselves.

NovaCiv is a digital platform we build together
to give people back the right to decide their own future.

If this idea resonates with you,
go to novaciv dot space
and subscribe to the future of the planet.
    `.trim(),
    prompt:
      "Ultra minimalistic white-on-white bas-relief of a digital civilization, abstract human silhouettes and neural lines, gentle camera movement, thoughtful and calm mood, vertical 9:16, loopable background for English voiceover.",
    preset: "short_auto_citation",
  },

  de: {
    topic: "Erste Begegnung mit NovaCiv",
    script: `
Stell dir eine Zivilisation ohne Herrscher und ohne Hinterzimmer vor.
Alle Entscheidungen werden offen von den Bürgern selbst getroffen.

NovaCiv ist eine digitale Plattform, die wir gemeinsam aufbauen,
um den Menschen das Recht zurückzugeben, über ihr eigenes Schicksal zu entscheiden.

Wenn dich dieser Gedanke anspricht,
geh auf novaciv Punkt space
und abonniere die Zukunft des Planeten.
    `.trim(),
    prompt:
      "Ultraminimalistisches weiß-auf-weiß-Relief einer digitalen Zivilisation, abstrakte Silhouetten von Menschen und Netzlinien, sanfte Kamerabewegung, nachdenkliche ruhige Stimmung, vertikal 9:16, loopbarer Hintergrund für deutsche Stimme.",
    preset: "short_auto_citation",
  },

  es: {
    topic: "Primer contacto con NovaCiv",
    script: `
Imagina una civilización sin gobernantes ni despachos cerrados.
Todas las decisiones las toman abiertamente los propios ciudadanos.

NovaCiv es una plataforma digital que construimos juntos,
para devolver a las personas el derecho de decidir su propio destino.

Si esta idea resuena contigo,
entra en novaciv punto space
y suscríbete al futuro del planeta.
    `.trim(),
    prompt:
      "Ilustración ultraminimalista en relieve blanco sobre blanco de una civilización digital, siluetas humanas abstractas y líneas de red, movimientos suaves de cámara, ambiente tranquilo y reflexivo, vertical 9:16, fondo en bucle para narración en español.",
    preset: "short_auto_citation",
  },
};

// выбираем следующий язык по кругу и сохраняем его в meta
async function getNextLanguage(db) {
  const metaRef = db.ref("videoJobsMeta");
  const snap = await metaRef.once("value");
  const meta = snap.val() || {};

  const lastLang = (meta.lastLang || "es").toLowerCase(); // чтобы первым был ru
  const lastIndex = LANGUAGE_ORDER.indexOf(lastLang);
  const nextIndex = (lastIndex + 1) % LANGUAGE_ORDER.length;
  const nextLang = LANGUAGE_ORDER[nextIndex];

  await metaRef.set({
    lastLang: nextLang,
    updatedAt: Date.now(),
  });

  return nextLang;
}

exports.handler = async (event, context) => {
  try {
    initFirebase();
    const db = admin.database();

    const language = await getNextLanguage(db);
    const template = JOB_TEMPLATES[language] || JOB_TEMPLATES.ru;

    const id = `nv-${Date.now()}`;

    const job = {
      id,
      language,
      topic: template.topic,
      script: template.script,
      prompt: template.prompt,
      preset: template.preset || "short_auto_citation",
      status: "pending",
      createdAt: Date.now(),
    };

    await db.ref(`videoJobs/${id}`).set(job);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, id, language }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};
