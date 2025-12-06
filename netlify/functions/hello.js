// netlify/functions/hello.js

exports.handler = async function (event, context) {
  try {
    console.log("[hello] test handler started");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        message: "hello function is working"
      })
    };
  } catch (e) {
    console.error("[hello] error:", e);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: e.message || String(e) })
    };
  }
};
