// netlify/functions/admin-proxy.js
//
// Server-side proxy for Admin Domovoy API
// Forwards requests to VPS endpoint with X-Admin-Token (never exposed to browser)
// Requires Netlify Identity admin role (RBAC gate)
// NO AI processing here - just proxy

const { requireAdmin } = require("./_lib/auth");

// ---------- ENV ----------
// Upstream base URL: ADMIN_DOMOVOY_API_URL (dedicated env var for admin-proxy)
// We always call `${base}/admin/domovoy` (base should be host:port, without path).
// NO fallback to DOMOVOY_API_URL to avoid accidentally pointing to ai-domovoy.
const ADMIN_DOMOVOY_API_URL = process.env.ADMIN_DOMOVOY_API_URL;
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN;

// ---------- Helpers ----------
function buildUpstreamUrl() {
  if (!ADMIN_DOMOVOY_API_URL) {
    return null; // Will trigger error response
  }
  // Ensure no trailing slash before appending path
  const normalizedBase = ADMIN_DOMOVOY_API_URL.replace(/\/+$/, "");
  return `${normalizedBase}/admin/domovoy`;
}

function sanitizeUrlForLogs(url) {
  if (!url) return "";
  // Strip basic auth if present (no secrets in logs)
  return url.replace(/\/\/.*@/, "//***@");
}

function attachProxyDebug(payload, extraDebug) {
  const body = payload && typeof payload === "object" ? { ...payload } : {};
  if (!body.debug || typeof body.debug !== "object") {
    body.debug = {};
  }
  // Always set origin to "admin-proxy" (never "proxy" or anything else)
  body.debug.origin = "admin-proxy";
  if (extraDebug && typeof extraDebug === "object") {
    body.debug = { ...body.debug, ...extraDebug };
  }
  return body;
}

function jsonResponse(statusCode, payload, extraDebug) {
  const body = attachProxyDebug(payload, extraDebug);
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "X-Domovoy-Origin": "proxy",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
    body: JSON.stringify(body),
  };
}

// ---------- Main handler ----------
exports.handler = async (event, context) => {
  // Start timing as early as possible in handler scope
  const startTime = Date.now();

  try {
    // CORS preflight
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "X-Domovoy-Origin": "proxy",
        },
        body: "",
      };
    }

    // Check method
    if (event.httpMethod !== "POST") {
      return jsonResponse(405, {
        ok: false,
        error: "Method Not Allowed",
      });
    }

    // Check admin role (RBAC gate)
    const authError = requireAdmin(context);
    if (authError) {
      return authError;
    }

    // Check ADMIN_DOMOVOY_API_URL is configured (required, no fallback)
    if (!ADMIN_DOMOVOY_API_URL) {
      return jsonResponse(500, {
        ok: false,
        error: "ADMIN_DOMOVOY_API_URL is not set",
        debug: {
          origin: "admin-proxy",
        },
      });
    }

    // Check token configured
    if (!ADMIN_API_TOKEN) {
      return jsonResponse(500, {
        ok: false,
        error: "ADMIN_API_TOKEN is not configured",
        message: "Admin API token is missing in Netlify environment variables",
        debugHint: "Set ADMIN_API_TOKEN in Netlify environment variables (same value as VPS .env)",
        debug: {
          origin: "admin-proxy",
        },
      });
    }

    // Parse request body
    const body = event.body || "{}";
    let requestData;
    try {
      requestData = JSON.parse(body);
    } catch (e) {
      const elapsedMs = Date.now() - startTime;
      return jsonResponse(
        400,
        {
          ok: false,
          error: "Invalid JSON",
          message: "Request body must be valid JSON",
          elapsedMs,
        },
        {
          where: "admin-proxy",
        },
      );
    }

    // Forward to VPS endpoint
    const vpsUrl = buildUpstreamUrl();
    if (!vpsUrl) {
      // This should not happen if ADMIN_DOMOVOY_API_URL check passed, but safety check
      return jsonResponse(500, {
        ok: false,
        error: "ADMIN_DOMOVOY_API_URL is not set",
        debug: {
          origin: "admin-proxy",
        },
      });
    }

    // Log start (no secrets)
    console.log(`[admin-proxy] Starting request to VPS: ${sanitizeUrlForLogs(vpsUrl)}`);

    // Create AbortController with longer timeout for stability report
    const timeoutMs =
      requestData &&
      (requestData.action === "stability:report" ||
        requestData.action === "snapshot:report")
        ? 180_000
        : requestData.action === "snapshot:download"
        ? 60_000
        : 10_000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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
        console.log(`[admin-proxy] Timeout after ${elapsedMs}ms: ${sanitizeUrlForLogs(vpsUrl)}`);
        return jsonResponse(
          504,
          {
            ok: false,
            error: "vps_timeout",
            message: `VPS did not respond within ${Math.round(timeoutMs / 1000)}s`,
            debugHint: "Check VPS reachability / port / firewall",
            elapsedMs,
            vpsEndpoint: sanitizeUrlForLogs(vpsUrl),
          },
          {
            upstreamStatus: null,
            upstreamUrl: vpsUrl, // Full URL including /admin/domovoy path
            where: "admin-proxy",
          },
        );
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
        console.log(
          `[admin-proxy] Connection error after ${elapsedMs}ms: ${errorCode || "unknown"} - ${sanitizeUrlForLogs(
            vpsUrl,
          )}`,
        );
        return jsonResponse(
          502,
          {
            ok: false,
            error: "vps_unreachable",
            message: "Cannot reach VPS endpoint",
            debugHint: "Port 3001 blocked or wrong URL",
            elapsedMs,
            vpsEndpoint: sanitizeUrlForLogs(vpsUrl),
            code: errorCode || "unknown",
          },
          {
            upstreamStatus: null,
            upstreamUrl: vpsUrl, // Full URL including /admin/domovoy path
            where: "admin-proxy",
          },
        );
      }

      // Other errors
      console.log(`[admin-proxy] Fetch error after ${elapsedMs}ms: ${errorCode || "unknown"}`);
      throw e; // Re-throw to be caught by outer catch
    }

    if (requestData && requestData.action === "snapshot:download") {
      const contentType = response.headers.get("content-type") || "application/octet-stream";
      const contentDisposition =
        response.headers.get("content-disposition") ||
        `attachment; filename="${(requestData.name || "download").toString().trim()}"`;
      const bodyBuffer = Buffer.from(await response.arrayBuffer());

      return {
        statusCode: response.status || 502,
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": contentDisposition,
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Expose-Headers": "Content-Disposition",
          "X-Domovoy-Origin": "proxy",
        },
        body: bodyBuffer.toString("base64"),
        isBase64Encoded: true,
      };
    }

    // Get response text
    const responseText = await response.text();

    // Try to parse as JSON
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      // If not JSON, return JSON error with upstream body snippet
      const upstreamBodySnippet = (responseText || "").slice(0, 300);
      return jsonResponse(
        response.status || 502,
        {
          ok: false,
          error: "upstream_non_json",
          message: "Upstream did not return valid JSON",
          upstreamBodySnippet,
        },
        {
          upstreamStatus: response.status,
          upstreamUrl: vpsUrl, // Full URL including /admin/domovoy path
          where: "admin-proxy",
        },
      );
    }

    // Attach proxy debug / upstream info (always set origin to "admin-proxy")
    const debugMeta = {
      upstreamStatus: response.status,
      upstreamUrl: vpsUrl, // Full URL including /admin/domovoy path
    };
    const bodyWithDebug = attachProxyDebug(responseData, debugMeta);

    // Return VPS response (preserve status code)
    return {
      statusCode: response.status || 200,
      headers: {
        "Content-Type": "application/json",
        "X-Domovoy-Origin": "proxy",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
      body: JSON.stringify(bodyWithDebug),
    };
  } catch (e) {
    const elapsedMs = Date.now() - startTime;
    const rawStack = e && e.stack ? String(e.stack) : "";
    const trimmedStack = rawStack.split("\n").slice(0, 6).join("\n");

    console.log(`[admin-proxy] Handler error after ${elapsedMs}ms: ${e.code || e.message || "unknown"}`);
    return jsonResponse(
      500,
      {
        ok: false,
        error: "proxy_error",
        message: e.message || "Unknown error",
        debugHint: "Check function logs and VPS endpoint connectivity",
        elapsedMs,
      },
      {
        where: "admin-proxy",
        stack: trimmedStack,
        upstreamStatus: null,
        upstreamUrl: buildUpstreamUrl(), // Full URL including /admin/domovoy path
      },
    );
  }
};
