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

    // ЖЁСТКО подстраховываемся: берём URL из переменных или используем прямой
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

exports.handler = async (event, context) => {
  try {
    initFirebase();
    const db = admin.database();

    // Можно потом делать разные типы роликов; пока — первый русский
    const id = `nv-${Date.now()}`;

    const script = `
Представь себе цивилизацию без правителей.
Где никто не может узурпировать власть,
а решения принимают только граждане.

NovaCiv — это не партия и не секта.
Это открытый цифровой проект,
который мы строим вместе — прозрачно и без насилия.

Если тебе не всё равно,
какой будет планета завтра —
зайди на novaciv точка space
и подпишись на будущее планеты.
`.trim();

    const prompt =
      "Ultra minimalistic white-on-white bas-relief of a futuristic digital civilization, abstract silhouettes of people, soft camera moves, calm yet serious mood, vertical 9:16, loopable background for philosophical Russian voiceover.";

    const job = {
      id,
      language: "ru",
      topic: "Первое знакомство с NovaCiv",
      script,
      prompt,
      status: "pending", // ещё не обработано
      createdAt: Date.now(),
    };

    await db.ref(`videoJobs/${id}`).set(job);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, id }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};
