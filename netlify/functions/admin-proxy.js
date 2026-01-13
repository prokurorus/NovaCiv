// netlify/functions/admin-proxy.js
//
// Server-side proxy for Admin Domovoy API
// Forwards requests to VPS endpoint with X-Admin-Token (never exposed to browser)
// Requires Netlify Identity admin role (RBAC gate)
// NO AI processing here - just proxy

const { requireAdmin } = require("./_lib/auth");

// ---------- ENV ----------
// VPS endpoint: use env var if set, otherwise default to VPS IP
const VPS_ENDPOINT = process.env.VPS_ADMIN_DOMOVOY_URL || "http://77.42.36.198:3001";
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN;

// ---------- Main handler ----------
exports.handler = async (event, context) => {
  try {
    // Check method
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Method Not Allowed" }),
      };
    }

    // Check admin role (RBAC gate)
    const authError = requireAdmin(context);
    if (authError) {
      return authError;
    }

    // Check token configured
    if (!ADMIN_API_TOKEN) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "ADMIN_API_TOKEN is not configured",
          message: "Admin API token is missing in Netlify environment variables",
          debugHint: "Set ADMIN_API_TOKEN in Netlify environment variables (same value as VPS .env)",
        }),
      };
    }

    // Check VPS endpoint configured
    if (!VPS_ENDPOINT) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "VPS_ADMIN_DOMOVOY_URL is not configured",
          message: "VPS endpoint URL is missing in Netlify environment variables",
          debugHint: "Set VPS_ADMIN_DOMOVOY_URL in Netlify environment variables (e.g., https://novaciv.space/api/admin/domovoy or http://VPS_IP:3001/admin/domovoy)",
        }),
      };
    }

    // Parse request body
    const body = event.body || "{}";
    let requestData;
    try {
      requestData = JSON.parse(body);
    } catch (e) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "Invalid JSON",
          message: "Request body must be valid JSON",
        }),
      };
    }

    // Forward to VPS endpoint
    const vpsUrl = `${VPS_ENDPOINT}/admin/domovoy`;
    
    console.log(`[admin-proxy] Forwarding to VPS: ${vpsUrl.replace(/\/\/.*@/, "//***@")}`); // Hide credentials in logs
    
    const response = await fetch(vpsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Token": ADMIN_API_TOKEN, // Token added server-side, never exposed to browser
      },
      body: JSON.stringify(requestData),
    });

    // Get response text
    const responseText = await response.text();
    
    // Try to parse as JSON
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      // If not JSON, return raw text with appropriate status
      return {
        statusCode: response.status || 502,
        headers: { "Content-Type": "text/plain" },
        body: responseText,
      };
    }

    // Return VPS response (preserve status code)
    return {
      statusCode: response.status || 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(responseData),
    };
    
  } catch (e) {
    console.error("[admin-proxy] Handler error:", e);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: "Internal Server Error",
        message: e.message || "Unknown error",
        debugHint: "Check function logs and VPS endpoint connectivity",
      }),
    };
  }
};
