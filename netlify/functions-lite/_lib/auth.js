// netlify/functions-lite/_lib/auth.js
//
// Shared authentication helpers for Netlify Functions
// Provides RBAC utilities for checking user roles
//
// ============================================================================
// NETLIFY ENV VAR USAGE:
// ============================================================================
// ✅ NO ENV VARS REQUIRED - Uses Netlify Identity context only
// ============================================================================

/**
 * Extract user from Netlify function context
 * @param {Object} context - Netlify function context
 * @returns {Object|null} User object or null
 */
function getUserFromContext(context) {
  return context?.clientContext?.user || null;
}

/**
 * Check if user has a specific role
 * @param {Object} user - User object from context
 * @param {string} role - Role to check (e.g., "admin")
 * @returns {boolean} True if user has the role
 */
function hasRole(user, role) {
  if (!user) return false;
  
  // Check app_metadata first (preferred for Netlify Identity)
  const appRoles = user.app_metadata?.roles || [];
  if (Array.isArray(appRoles) && appRoles.includes(role)) {
    return true;
  }
  
  // Fallback to user_metadata
  const userRoles = user.user_metadata?.roles || [];
  if (Array.isArray(userRoles) && userRoles.includes(role)) {
    return true;
  }
  
  return false;
}

/**
 * Require user authentication
 * @param {Object} context - Netlify function context
 * @returns {Object|null} Error response object if unauthorized, null if authorized
 */
function requireUser(context) {
  const user = getUserFromContext(context);
  
  if (!user) {
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "unauthorized" }),
    };
  }
  
  return null;
}

/**
 * Require admin role
 * @param {Object} context - Netlify function context
 * @returns {Object|null} Error response object if unauthorized/forbidden, null if authorized
 */
function requireAdmin(context) {
  const user = getUserFromContext(context);
  
  if (!user) {
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        ok: false,
        error: "unauthorized",
        message: "Authentication required. Please log in via Netlify Identity and ensure JWT token is sent in Authorization header."
      }),
    };
  }
  
  if (!hasRole(user, "admin")) {
    const userEmail = user.email || "unknown";
    return {
      statusCode: 403,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        ok: false,
        error: "forbidden",
        message: `Access denied. Admin role required. Current user: ${userEmail}`
      }),
    };
  }
  
  return null;
}

module.exports = {
  getUserFromContext,
  hasRole,
  requireUser,
  requireAdmin,
};
