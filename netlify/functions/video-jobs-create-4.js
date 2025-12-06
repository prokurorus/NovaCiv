// netlify/functions/video-jobs-create-4.js

exports.handler = async function (event, context) {
  try {
    console.log("[video-jobs-create-4] minimal test started");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        message: "video-jobs-create-4 minimal test OK"
      }),
    };
  } catch (e) {
    console.error("[video-jobs-create-4] error in minimal test:", e);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: e.message || String(e) }),
    };
  }
};
