// server/lib/sanitizeTelemetry.js
//
// Deep-sanitize telemetry JSON to remove any secret-like strings.

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{10,}/g, // OpenAI-like
  /ghp_[a-zA-Z0-9]{20,}/g, // GitHub PAT
  /github_pat_[a-zA-Z0-9]{20,}/g,
  /gho_[a-zA-Z0-9]{20,}/g, // GitHub OAuth token
  /AIza[0-9A-Za-z_-]{20,}/g, // Google/Firebase
  /GOCSPX-[0-9A-Za-z_-]{10,}/g,
  /xox[baprs]-[0-9A-Za-z-]{10,}/g, // Slack tokens
  /ya29\.[0-9A-Za-z_-]+/g, // Google OAuth
  /-----BEGIN[^-]+-----[\s\S]*?-----END[^-]+-----/g,
  /\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b/gi,
  /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, // JWT
  /"token"\s*:\s*"[^"]+"/gi,
  /"apiKey"\s*:\s*"[^"]+"/gi,
  /"password"\s*:\s*"[^"]+"/gi,
  /"authorization"\s*:\s*"[^"]+"/gi,
];

function sanitizeString(value) {
  if (typeof value !== "string") return value;
  let sanitized = value;
  SECRET_PATTERNS.forEach((pattern) => {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  });
  return sanitized;
}

function sanitizeTelemetry(input) {
  if (input === null || input === undefined) return input;
  if (typeof input === "string") return sanitizeString(input);
  if (typeof input === "number" || typeof input === "boolean") return input;
  if (Array.isArray(input)) return input.map((item) => sanitizeTelemetry(item));
  if (typeof input === "object") {
    const output = {};
    Object.keys(input).forEach((key) => {
      const sanitizedKey = sanitizeString(key);
      output[sanitizedKey] = sanitizeTelemetry(input[key]);
    });
    return output;
  }
  return input;
}

module.exports = {
  sanitizeTelemetry,
};
