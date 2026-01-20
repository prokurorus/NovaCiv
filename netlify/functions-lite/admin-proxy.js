// netlify/functions-lite/admin-proxy.js
//
// Server-side proxy for Admin Domovoy API
// Forwards requests to VPS endpoint with X-Admin-Token (never exposed to browser)
// Requires Netlify Identity admin role (RBAC gate)
// NO AI processing here - just proxy
//
// ============================================================================
// NETLIFY ENV VAR USAGE (MINIMAL SET):
// ============================================================================
// ✅ NETLIFY-SAFE (required for this function):
//   - ADMIN_DOMOVOY_API_URL: VPS endpoint URL (e.g., "http://vps")
//   - ADMIN_API_TOKEN: Token for VPS authentication
//
// ❌ VPS-ONLY (NOT used by this function, can be removed from Netlify after migration):
//   - FIREBASE_* (all Firebase vars)
//   - OPENAI_* (all OpenAI vars)
//   - TELEGRAM_* (all Telegram vars)
//   - YOUTUBE_* (all YouTube vars)
//   - DOMOVOY_CRON_SECRET, DOMOVOY_REPLY_CRON_SECRET, NEWS_CRON_SECRET, OPS_CRON_SECRET
//   - SENDGRID_API_KEY
// ============================================================================

// ---------- ENV ----------
// Upstream base URL: ADMIN_DOMOVOY_API_URL (dedicated env var for admin-proxy)
// We always call `${base}/admin/domovoy` (base should be host[:port], without path).
// NO fallback to DOMOVOY_API_URL to avoid accidentally pointing to ai-domovoy.
const ADMIN_DOMOVOY_API_URL = process.env.ADMIN_DOMOVOY_API_URL;
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN;

// ---------- Helpers ----------
function normalizeBaseUrl(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Remove trailing slashes
  let base = trimmed.replace(/\/+$/, "");
  // Remove /admin/(domovoy|direct) suffix if present
  base = base.replace(/\/admin\/(domovoy|direct)$/i, "");
  // Remove /admin suffix if present (but keep the base if it's just /admin)
  base = base.replace(/\/admin$/i, "");
  // Remove trailing slashes again after suffix removal
  base = base.replace(/\/+$/, "");
  // IMPORTANT: Do not add a default port here (use ADMIN_DOMOVOY_API_URL as-is).
  return base;
}

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

function extractHealthTarget(event) {
  const rawPath = event?.path || event?.rawUrl || "";
  if (!rawPath) return null;
  const pathOnly = rawPath.split("?")[0];
  const prefixes = [
    "/.netlify/functions/admin-proxy/admin/health/",
    "/.netlify/functions/admin-proxy/health/",
    "/admin/health/",
  ];
  let suffix = null;
  for (const prefix of prefixes) {
    if (pathOnly.startsWith(prefix)) {
      suffix = pathOnly.slice(prefix.length);
      break;
    }
  }
  if (!suffix) return null;
  const target = suffix.split("/")[0];
  if (target === "news" || target === "domovoy") {
    return target;
  }
  return null;
}

function extractResultJobId(event) {
  const rawPath = event?.path || event?.rawUrl || "";
  if (!rawPath) return null;
  const pathOnly = rawPath.split("?")[0];
  const prefixes = [
    "/.netlify/functions/admin-proxy/admin/result/",
    "/.netlify/functions/admin-proxy/result/",
    "/admin/result/",
  ];
  let suffix = null;
  for (const prefix of prefixes) {
    if (pathOnly.startsWith(prefix)) {
      suffix = pathOnly.slice(prefix.length);
      break;
    }
  }
  if (!suffix) return null;
  const jobId = suffix.split("/")[0];
  return jobId || null;
}

/**
 * Authorize admin access via Netlify Identity role OR token fallback
 * @param {Object} event - Netlify function event (contains headers)
 * @param {Object} context - Netlify function context (contains clientContext.user)
 * @returns {Object|null} Error response object if unauthorized, null if authorized
 */
function authorizeAdmin(event, context) {
  // First, check Netlify Identity context for admin role
  const user = context?.clientContext?.user;
  
  if (user) {
    // Check for admin role in various metadata locations
    const appRoles = user.app_metadata?.roles || [];
    const userRoles = user.user_metadata?.roles || [];
    const appRole = user.app_metadata?.role; // singular string fallback
    
    const hasAdminRole = 
      (Array.isArray(appRoles) && appRoles.includes("admin")) ||
      (Array.isArray(userRoles) && userRoles.includes("admin")) ||
      (typeof appRole === "string" && appRole === "admin");
    
    if (hasAdminRole) {
      return null; // Authorized via Identity role
    }
  }
  
  // Fallback to token-based authentication
  const headers = event.headers || {};
  
  // Try x-admin-token header first (preferred)
  let token = headers["x-admin-token"] || headers["X-Admin-Token"];
  
  // Fallback to Authorization: Bearer <token>
  if (!token) {
    const authHeader = headers["authorization"] || headers["Authorization"] || "";
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (bearerMatch) {
      token = bearerMatch[1];
    }
  }
  
  // Check if token is provided
  if (!token) {
    return jsonResponse(403, {
      ok: false,
      error: "forbidden",
      message: "Access denied",
      debug: {
        origin: "admin-proxy",
      },
    });
  }
  
  // Compare with ADMIN_API_TOKEN
  const expectedToken = process.env.ADMIN_API_TOKEN;
  if (!expectedToken) {
    return jsonResponse(500, {
      ok: false,
      error: "server_error",
      message: "ADMIN_API_TOKEN is not configured",
    });
  }
  
  if (token !== expectedToken) {
    return jsonResponse(403, {
      ok: false,
      error: "forbidden",
      message: "Access denied",
      debug: {
        origin: "admin-proxy",
      },
    });
  }
  
  return null; // Authorized via token
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
    },
    body: JSON.stringify(body),
  };
}

// ---------- Main handler ----------
exports.handler = async (event, context) => {
  // Start timing as early as possible in handler scope
  const startTime = Date.now();

  try {
    const healthTarget = extractHealthTarget(event);
    if (healthTarget) {
      if (event.httpMethod !== "GET") {
        return jsonResponse(405, {
          ok: false,
          error: "Method Not Allowed",
        });
      }

      const authError = authorizeAdmin(event, context);
      if (authError) {
        return authError;
      }

      if (!ADMIN_DOMOVOY_API_URL) {
        return jsonResponse(500, {
          ok: false,
          error: "ADMIN_DOMOVOY_API_URL is not set",
          debug: {
            origin: "admin-proxy",
          },
        });
      }

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

      const base = normalizeBaseUrl(ADMIN_DOMOVOY_API_URL);
      if (!base) {
        return jsonResponse(500, {
          ok: false,
          error: "ADMIN_DOMOVOY_API_URL is not set",
          debug: {
            origin: "admin-proxy",
          },
        });
      }

      const vpsUrl = `${base}/admin/health/${healthTarget}`;
      console.log(`[admin-proxy] Health proxy start: ${sanitizeUrlForLogs(vpsUrl)}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25_000);

      let response;
      let elapsedMs;

      try {
        response = await fetch(vpsUrl, {
          method: "GET",
          headers: {
            "X-Admin-Token": ADMIN_API_TOKEN,
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        elapsedMs = Date.now() - startTime;
      } catch (e) {
        clearTimeout(timeoutId);
        elapsedMs = Date.now() - startTime;

        if (e.name === "AbortError" || e.message?.includes("aborted")) {
          console.log(`[admin-proxy] Health timeout after ${elapsedMs}ms: ${sanitizeUrlForLogs(vpsUrl)}`);
          return jsonResponse(
            504,
            {
              ok: false,
              error: "vps_timeout",
              message: "VPS did not respond within 25s",
              debugHint: "Check VPS reachability / port / firewall",
              elapsedMs,
              vpsEndpoint: sanitizeUrlForLogs(vpsUrl),
            },
            {
              upstreamStatus: null,
              upstreamUrl: vpsUrl,
              where: "admin-proxy",
            },
          );
        }

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
            `[admin-proxy] Health connection error after ${elapsedMs}ms: ${errorCode || "unknown"} - ${sanitizeUrlForLogs(
              vpsUrl,
            )}`,
          );
          return jsonResponse(
            502,
            {
              ok: false,
              error: "vps_unreachable",
              message: "Cannot reach VPS endpoint",
              debugHint: "Port blocked or wrong URL",
              elapsedMs,
              vpsEndpoint: sanitizeUrlForLogs(vpsUrl),
              code: errorCode || "unknown",
            },
            {
              upstreamStatus: null,
              upstreamUrl: vpsUrl,
              where: "admin-proxy",
            },
          );
        }

        console.log(`[admin-proxy] Health fetch error after ${elapsedMs}ms: ${errorCode || "unknown"}`);
        throw e;
      }

      const responseText = await response.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
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
            upstreamUrl: vpsUrl,
            where: "admin-proxy",
          },
        );
      }

      const debugMeta = {
        upstreamStatus: response.status,
        upstreamUrl: vpsUrl,
        healthTarget,
        elapsedMs,
      };
      const bodyWithDebug = attachProxyDebug(responseData, debugMeta);

      return {
        statusCode: response.status || 200,
        headers: {
          "Content-Type": "application/json",
          "X-Domovoy-Origin": "proxy",
        },
        body: JSON.stringify(bodyWithDebug),
      };
    }

    const resultJobId = extractResultJobId(event);
    if (resultJobId) {
      if (event.httpMethod !== "GET") {
        return jsonResponse(405, {
          ok: false,
          error: "Method Not Allowed",
        });
      }

      const authError = authorizeAdmin(event, context);
      if (authError) {
        return authError;
      }

      if (!ADMIN_DOMOVOY_API_URL) {
        return jsonResponse(500, {
          ok: false,
          error: "ADMIN_DOMOVOY_API_URL is not set",
          debug: {
            origin: "admin-proxy",
          },
        });
      }

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

      const base = normalizeBaseUrl(ADMIN_DOMOVOY_API_URL);
      if (!base) {
        return jsonResponse(500, {
          ok: false,
          error: "ADMIN_DOMOVOY_API_URL is not set",
          debug: {
            origin: "admin-proxy",
          },
        });
      }

      const vpsUrl = `${base}/admin/result/${encodeURIComponent(resultJobId)}`;
      console.log(`[admin-proxy] Result proxy start: ${sanitizeUrlForLogs(vpsUrl)}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25_000);

      let response;
      let elapsedMs;

      try {
        response = await fetch(vpsUrl, {
          method: "GET",
          headers: {
            "X-Admin-Token": ADMIN_API_TOKEN,
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        elapsedMs = Date.now() - startTime;
      } catch (e) {
        clearTimeout(timeoutId);
        elapsedMs = Date.now() - startTime;

        if (e.name === "AbortError" || e.message?.includes("aborted")) {
          console.log(`[admin-proxy] Result timeout after ${elapsedMs}ms: ${sanitizeUrlForLogs(vpsUrl)}`);
          return jsonResponse(
            504,
            {
              ok: false,
              error: "vps_timeout",
              message: "VPS did not respond within 25s",
              debugHint: "Check VPS reachability / port / firewall",
              elapsedMs,
              vpsEndpoint: sanitizeUrlForLogs(vpsUrl),
            },
            {
              upstreamStatus: null,
              upstreamUrl: vpsUrl,
              where: "admin-proxy",
            },
          );
        }

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
            `[admin-proxy] Result connection error after ${elapsedMs}ms: ${errorCode || "unknown"} - ${sanitizeUrlForLogs(
              vpsUrl,
            )}`,
          );
          return jsonResponse(
            502,
            {
              ok: false,
              error: "vps_unreachable",
              message: "Cannot reach VPS endpoint",
              debugHint: "Port blocked or wrong URL",
              elapsedMs,
              vpsEndpoint: sanitizeUrlForLogs(vpsUrl),
              code: errorCode || "unknown",
            },
            {
              upstreamStatus: null,
              upstreamUrl: vpsUrl,
              where: "admin-proxy",
            },
          );
        }

        console.log(`[admin-proxy] Result fetch error after ${elapsedMs}ms: ${errorCode || "unknown"}`);
        throw e;
      }

      const responseText = await response.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
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
            upstreamUrl: vpsUrl,
            where: "admin-proxy",
          },
        );
      }

      const debugMeta = {
        upstreamStatus: response.status,
        upstreamUrl: vpsUrl,
        elapsedMs,
      };
      const bodyWithDebug = attachProxyDebug(responseData, debugMeta);

      return {
        statusCode: response.status || 200,
        headers: {
          "Content-Type": "application/json",
          "X-Domovoy-Origin": "proxy",
        },
        body: JSON.stringify(bodyWithDebug),
      };
    }

    // Check method
    if (event.httpMethod !== "POST") {
      return jsonResponse(405, {
        ok: false,
        error: "Method Not Allowed",
      });
    }

    // Check admin authentication (Identity role OR token fallback)
    const authError = authorizeAdmin(event, context);
    if (authError) {
      return authError;
    }

    // Check ADMIN_DOMOVOY_API_URL is configured (required, no fallback)
    // This check happens before mode validation, so we can build URLs correctly
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

    // Validate and set mode (default to "direct" if missing or invalid)
    const modeRaw = requestData.mode;
    const validModes = ["ops", "strategy", "direct"];
    const mode = validModes.includes(modeRaw) ? modeRaw : "direct";
    requestData.mode = mode;

    // Build upstream URL based on mode
    // For "direct" mode: use /admin/direct, otherwise use /admin/domovoy
    const base = normalizeBaseUrl(ADMIN_DOMOVOY_API_URL);
    if (!base) {
      return jsonResponse(500, {
        ok: false,
        error: "ADMIN_DOMOVOY_API_URL is not set",
        debug: {
          origin: "admin-proxy",
        },
      });
    }
    const endpoint = mode === "direct" ? "/admin/direct" : "/admin/domovoy";
    const vpsUrl = `${base}${endpoint}`;

    // Log start (no secrets)
    console.log(`[admin-proxy] Starting request to VPS: ${sanitizeUrlForLogs(vpsUrl)}`);

    // Create AbortController for 10s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25_000);

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
            message: "VPS did not respond within 25s",
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
            debugHint: "Port blocked or wrong URL",
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
        upstreamUrl: null, // Cannot build URL in error case
      },
    );
  }
};
