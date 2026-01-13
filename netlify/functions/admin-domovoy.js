// netlify/functions/admin-domovoy.js
//
// DISABLED: Admin Domovoy moved to VPS-only service
// This endpoint returns 410 Gone to prevent accidental use
// Use /.netlify/functions/admin-proxy instead (forwards to VPS)

exports.handler = async (event, context) => {
  return {
    statusCode: 410,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ok: false,
      error: "moved_to_vps",
      message: "Admin Domovoy moved to VPS API. Use /.netlify/functions/admin-proxy instead.",
    }),
  };
};

