// netlify/functions/video-worker.js
// Этап 1: читаем очередь видео-задач из Firebase, без генерации видео.

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
        "FIREBASE_DB_URL или FIREBASE_DATABASE_URL не заданы (URL Realtime DB)"
      );
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: dbUrl,
      });
    }

    initialized = true;
  }

  return admin.database();
}

exports.handler = async (event) => {
  try {
    const db = initFirebase();

    // Ищем первую задачу со статусом "pending"
    const snap = await db
      .ref("videoJobs")
      .orderByChild("status")
      .equalTo("pending")
      .limitToFirst(1)
      .once("value");

    const jobs = snap.val();

    if (!jobs) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(
          { ok: true, message: "no pending jobs in videoJobs" },
          null,
          2
        ),
      };
    }

    const id = Object.keys(jobs)[0];
    const job = jobs[id];

    // Помечаем задачу как "picked-debug", чтобы видеть, что её забрали
    await db.ref(`videoJobs/${id}/status`).set("picked-debug");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(
        {
          ok: true,
          id,
          job,
          note: "job picked from queue and marked as picked-debug",
        },
        null,
        2
      ),
    };
  } catch (err) {
    console.error("[video-worker] error:", err);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(
        {
          ok: false,
          error: err.message || String(err),
        },
        null,
        2
      ),
    };
  }
};
