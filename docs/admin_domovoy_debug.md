# Admin Domovoy Debug & Verification Guide

This document describes how to verify the admin-domovoy and public-domovoy functions are working correctly in production.

## Prerequisites

- Access to Netlify dashboard (for function logs)
- Browser with developer console
- Admin account with `admin` role in Netlify Identity
- Regular user account (non-admin) in Netlify Identity

## Verification Checklist

### 1. Frontend: Login Modal Opens

**Test:** Navigate to `/admin` while logged out.

**Expected:**
- Identity modal opens automatically
- OR clicking "Войти" button opens the modal
- No console errors related to `netlifyIdentity`

**Browser Console Check:**
```javascript
typeof window.netlifyIdentity  // Should return "object"
```

**If modal doesn't open:**
- Check browser console for errors
- Verify `index.html` has the Identity widget script in `<head>` (no defer/async)
- Check CSS z-index rules in `src/index.css` (should be `2147483647`)

### 2. RBAC: admin-domovoy Endpoint

#### Test 2.1: Logged Out User

**Request:**
```bash
POST /.netlify/functions/admin-domovoy
Content-Type: application/json

{}
```

**Expected Response:**
```json
{
  "error": "unauthorized"
}
```
**Status:** 401

#### Test 2.2: Logged In Non-Admin User

**Request:**
```bash
POST /.netlify/functions/admin-domovoy
Content-Type: application/json
Authorization: Bearer <user_jwt_token>

{
  "text": "test question"
}
```

**Expected Response:**
```json
{
  "error": "forbidden"
}
```
**Status:** 403

#### Test 2.3: Logged In Admin User

**Request:**
```bash
POST /.netlify/functions/admin-domovoy
Content-Type: application/json
Authorization: Bearer <admin_jwt_token>

{
  "text": "What is the current project state?"
}
```

**Expected Response:**
```json
{
  "ok": true,
  "reply": "<actual response from OpenAI based on PROJECT_CONTEXT.md>"
}
```
**Status:** 200

**Important:** The reply should NOT be "нет данных" (no data). If you see this, check:
- Function logs in Netlify dashboard for context loading errors
- Verify `docs/PROJECT_CONTEXT.md` exists and is included in build
- Check `netlify.toml` has `included_files = ["media/**", "docs/**"]`

### 3. RBAC: public-domovoy Endpoint

#### Test 3.1: Logged Out User

**Request:**
```bash
POST /.netlify/functions/public-domovoy
Content-Type: application/json

{
  "text": "test"
}
```

**Expected Response:**
```json
{
  "error": "unauthorized"
}
```
**Status:** 401

#### Test 3.2: Logged In User (Any Role)

**Request:**
```bash
POST /.netlify/functions/public-domovoy
Content-Type: application/json
Authorization: Bearer <user_jwt_token>

{
  "text": "What is NovaCiv?"
}
```

**Expected Response:**
```json
{
  "reply": "<response about NovaCiv philosophy>"
}
```
**Status:** 200

#### Test 3.3: Input Length Limit

**Request:**
```bash
POST /.netlify/functions/public-domovoy
Content-Type: application/json
Authorization: Bearer <user_jwt_token>

{
  "text": "<800+ character string>"
}
```

**Expected Response:**
```json
{
  "error": "Input too long. Maximum 800 characters allowed."
}
```
**Status:** 400

### 4. Error Handling: Context Loading Failures

If `PROJECT_CONTEXT.md` or `PROJECT_STATE.md` cannot be loaded, admin-domovoy should return:

**Expected Response:**
```json
{
  "ok": false,
  "error": "context_missing",
  "details": "Failed to load context files: <error message>"
}
```
**Status:** 500

### 5. Error Handling: OpenAI API Failures

If OpenAI API fails, both functions should return:

**Expected Response:**
```json
{
  "error": "openai_failed",
  "details": "OpenAI API returned status <status_code>"
}
```
**Status:** 502

## Function Logs

To debug issues, check Netlify Function logs:

1. Go to Netlify Dashboard → Your Site → Functions
2. Click on `admin-domovoy` or `public-domovoy`
3. Check logs for:
   - `[admin-domovoy] Loaded PROJECT_CONTEXT.md from: <path>` (success)
   - `[admin-domovoy] Failed to load PROJECT_CONTEXT.md: <error>` (failure)
   - Authentication errors
   - OpenAI API errors

## Common Issues

### Issue: "нет данных" response

**Root Cause:** Context files not loading or empty.

**Fix:**
1. Verify `docs/PROJECT_CONTEXT.md` exists in repo
2. Check `netlify.toml` includes `docs/**` in `included_files`
3. Redeploy site to include files in function bundle
4. Check function logs for file loading errors

### Issue: Modal doesn't open

**Root Cause:** Script loading or CSS z-index issues.

**Fix:**
1. Verify `index.html` has Identity script in `<head>` (no defer/async)
2. Check `src/index.css` has z-index rules for `.netlify-identity-modal`
3. Clear browser cache and reload
4. Check browser console for JavaScript errors

### Issue: 401/403 when should be authorized

**Root Cause:** JWT token not passed or user role not set.

**Fix:**
1. Verify `Authorization: Bearer <token>` header is present
2. Check user has `admin` role in Netlify Identity dashboard
3. Role should be in `app_metadata.roles` array: `["admin"]`
4. User may need to log out and log back in to refresh JWT claims

## Response Format

All function responses MUST:
- Have `Content-Type: application/json` header
- Return valid JSON (never HTML or plain text)
- Include error details in `error` and `details` fields (no secrets)

## Security Notes

- Never expose secrets in error messages
- All authentication checks happen server-side
- Admin functions require `admin` role in `app_metadata.roles`
- Public functions require any authenticated user (no role check)
