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
    const startTime = Date.now();
    
    // Log start (no secrets)
    console.log(`[admin-proxy] Starting request to VPS: ${vpsUrl.replace(/\/\/.*@/, "//***@")}`);
    
    // Create AbortController for 10s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    
    let response;
    let elapsedMs;
    
    try {
      response = await fetch(vpsUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Token": ADMIN_API_TOKEN, // Token added server-side, never exposed to browser
        },
        body: JSON.stringify(requestData),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      elapsedMs = Date.now() - startTime;
      
    } catch (e) {
      clearTimeout(timeoutId);
      elapsedMs = Date.now() - startTime;
      
      // Handle timeout
      if (e.name === "AbortError" || e.message?.includes("aborted")) {
        console.log(`[admin-proxy] Timeout after ${elapsedMs}ms: ${vpsUrl.replace(/\/\/.*@/, "//***@")}`);
        return {
          statusCode: 504,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ok: false,
            error: "vps_timeout",
            message: "VPS did not respond within 10s",
            debugHint: "Check VPS reachability / port / firewall",
            elapsedMs,
            vpsEndpoint: vpsUrl.replace(/\/\/.*@/, "//***@"),
          }),
        };
      }
      
      // Handle connection errors
      const errorCode = e.code || e.errno || e.message?.toUpperCase();
      const isConnectionError = 
        errorCode === "ECONNREFUSED" ||
        errorCode === "ENOTFOUND" ||
        errorCode === "EHOSTUNREACH" ||
        errorCode === "ETIMEDOUT" ||
        e.message?.includes("ECONNREFUSED") ||
        e.message?.includes("ENOTFOUND") ||
        e.message?.includes("EHOSTUNREACH") ||
        e.message?.includes("ETIMEDOUT") ||
        e.message?.includes("getaddrinfo");
      
      if (isConnectionError) {
        console.log(`[admin-proxy] Connection error after ${elapsedMs}ms: ${errorCode || "unknown"} - ${vpsUrl.replace(/\/\/.*@/, "//***@")}`);
        return {
          statusCode: 502,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ok: false,
            error: "vps_unreachable",
            message: "Cannot reach VPS endpoint",
            debugHint: "Port 3001 blocked or wrong URL",
            elapsedMs,
            vpsEndpoint: vpsUrl.replace(/\/\/.*@/, "//***@"),
            code: errorCode || "unknown",
          }),
        };
      }
      
      // Other errors
      console.log(`[admin-proxy] Fetch error after ${elapsedMs}ms: ${errorCode || "unknown"}`);
      throw e; // Re-throw to be caught by outer catch
    }
    
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
    const elapsedMs = Date.now() - (startTime || Date.now());
    console.log(`[admin-proxy] Handler error after ${elapsedMs}ms: ${e.code || e.message || "unknown"}`);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: "Internal Server Error",
        message: e.message || "Unknown error",
        debugHint: "Check function logs and VPS endpoint connectivity",
        elapsedMs,
      }),
    };
  }
};
