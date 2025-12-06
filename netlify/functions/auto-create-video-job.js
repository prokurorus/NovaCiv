// netlify/functions/auto-create-video-job.js

exports.handler = async function (event, context) {
  try {
    console.log("[auto-create-video-job] test handler started");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        message: "auto-create-video-job minimal test OK"
      })
    };
  } catch (e) {
    console.error("[auto-create-video-job] error in test handler:", e);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: e.message || String(e) })
    };
  }
};
