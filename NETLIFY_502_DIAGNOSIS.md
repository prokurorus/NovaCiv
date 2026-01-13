# Netlify 502 UserCodeSyntaxError Diagnosis Guide

## Problem
- Repo syntax OK: `node --check` passes on all files
- Netlify returns: `502 UserCodeSyntaxError: Unexpected token 'catch'`
- **Hypothesis**: Netlify is executing a stale/cached or differently bundled artifact

## Step 1: Check Netlify Deploy Logs

1. Go to **Netlify Dashboard** → Your Site → **Deploys**
2. Open the **latest Published deploy**
3. Open **Deploy log**
4. Search for these terms (Ctrl+F / Cmd+F):
   - `ops-run-now`
   - `Functions bundling`
   - `Error bundling`
   - `esbuild`
   - `SyntaxError`
   - `Unexpected token`
   - `catch`

5. **Copy 20-40 lines** around any matches, especially:
   - The exact error message
   - The file path mentioned
   - The line number
   - Any esbuild bundling output

**Expected output format:**
```
Functions bundling: ops-run-now
Error bundling function ops-run-now:
SyntaxError: Unexpected token 'catch'
  at netlify/functions/ops-run-now.js:XXX:YY
```

## Step 2: Trigger Clean Rebuild

### Option A: Clear Cache and Redeploy
1. Netlify Dashboard → **Deploys**
2. Click **"Clear cache and deploy site"** (or **"Trigger deploy"** → **"Clear cache and deploy site"**)
3. Wait for deploy to complete
4. Verify the new deploy shows your **latest commit SHA**

### Option B: Retry with Cache Clear
1. Netlify Dashboard → **Deploys**
2. Find the latest deploy
3. Click **"..."** (three dots) → **"Retry deploy"**
4. **Enable "Clear cache"** checkbox
5. Click **"Retry deploy"**

### Verify Deploy
- Check that the deploy log shows:
  - `Clearing cache`
  - `Installing dependencies`
  - `Functions bundling` (should show fresh bundling)
  - No cached artifacts

## Step 3: Test After Clean Deploy

After the clean deploy is **Published**, test:

```powershell
curl.exe -i "https://novaciv.space/.netlify/functions/ops-run-now?dry=1"
```

**Expected**: Status `200 OK` (not `502`)

**If still 502**: Continue to Step 4.

## Step 4: Inspect Deployed Bundle

If Step 3 still returns 502:

### Option A: Download Bundle from Netlify UI
1. Netlify Dashboard → **Functions**
2. Find `ops-run-now`
3. Look for **"Download bundle"** or **"View source"** option
4. Download and inspect the bundled file
5. Search for `catch` tokens and verify syntax

### Option B: Check Function Logs
1. Netlify Dashboard → **Functions** → `ops-run-now`
2. Open **Function logs**
3. Look for the exact error with file:line
4. The error should show the **deployed bundle path**, not repo path

### Option C: Use Netlify CLI (if available)
```bash
netlify functions:list
netlify functions:invoke ops-run-now --dry-run
```

## Step 5: Report Findings

After completing Steps 1-4, provide:

1. **Deploy log snippet** (20-40 lines around error)
2. **Exact error message** from deploy log or function logs
3. **File path and line number** from the error (if available)
4. **Bundle inspection results** (if downloaded)
5. **Test result** after clean deploy

## Common Causes

1. **Stale bundle cache**: Netlify cached an old broken version
2. **esbuild bundling issue**: Bundler may be transforming code incorrectly
3. **Dependency issue**: A dependency may have syntax errors
4. **Build-time transformation**: Some build step may be corrupting the code

## Next Steps

**DO NOT** change code until we have:
- The exact file:line from Netlify's error
- Confirmation that clean rebuild still fails
- Bundle inspection results

Once we have the real error location from Netlify, we can apply a minimal fix.
