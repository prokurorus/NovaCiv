# System report — 2026-01-18 10:16 EET

## Summary
- Access gaps: no SSH access to VPS `77.42.36.198` (root), no Firebase admin SDK access, GitHub CLI not available for issues; VPS checks and Firebase reads were not possible.
- Netlify public health endpoint returns `200`, so Netlify edge is reachable.
- Netlify `admin-proxy` returns `405` without auth (expected for some methods), but this does not validate backend reachability.
- `admin-api.novaciv.space` is not resolvable from the local environment (DNS failure), so admin API health cannot be confirmed.
- Repo config shows Netlify functions deployed from `netlify/functions-lite`, while heavier functions are intended to run on VPS.

## Evidence
- Netlify functions directory in repo: `netlify/functions-lite` contains `admin-proxy.js`, `health-domovoy.js`, `health-news.js`.
- `netlify.toml` config:
  - `functions = "netlify/functions-lite"`
  - "Only admin-proxy is deployed to Netlify" (VPS-only for heavy functions).
- Local endpoint checks:
  - `https://novaciv.space/.netlify/functions/health` → `200` (0.16s)
  - `https://novaciv.space/.netlify/functions/admin-proxy` → `405` (0.33s)
  - `https://admin-api.novaciv.space/health` → DNS resolution failure (curl error 6)
  - `https://admin-api.novaciv.space/` → DNS resolution failure (curl error 6)
- Recent commits show multiple admin/identity fixes and proxy alignment (last 20 commits reviewed).
- No VPS snapshot, PM2 logs, or Firebase reads collected due to missing access.

## Components matrix
| Component | Status | Symptom | Likely cause | What to check/fix |
| --- | --- | --- | --- | --- |
| VPS host `77.42.36.198` | Unknown | No SSH access | Access not available | Provide SSH access or run commands locally on VPS |
| `admin-api.novaciv.space` | Degraded/Unknown | DNS resolution failure locally | DNS misconfig, domain expired, or host unreachable | Check DNS records, VPS ingress, nginx, PM2 |
| Netlify functions (lite) | OK (partial) | `health` responds 200 | Netlify edge up | Verify backend linkage if needed |
| Netlify `admin-proxy` | Unknown | `405` without auth | Method/route restrictions | Test with expected method/auth |
| Ops agent (PM2 `nova-ops-agent`) | Unknown | No logs collected | VPS access missing | Check PM2 status/logs on VPS |
| Admin domovoy (PM2 `nova-admin-domovoy`) | Unknown | No logs collected | VPS access missing | Check PM2 status/logs on VPS |
| Video worker (PM2 `nova-video`) | Unknown | No logs collected | VPS access missing | Check PM2 status/logs on VPS |
| Firebase RTDB | Unknown | No read performed | Access not available | Use admin SDK on VPS (read-only) |

## Root cause hypotheses
1. **P0**: DNS for `admin-api.novaciv.space` is broken or not resolvable, causing admin API outage from clients.
2. **P0**: VPS services are down or PM2 processes are stopped/crashing; admin API and agents would be unavailable.
3. **P1**: Nginx/ingress misrouting to admin API after recent changes (admin route changes or host mismatch).
4. **P1**: Netlify `admin-proxy` expects method/auth and fails with `405` for default checks; may mask backend issues.
5. **P2**: Firebase access failures (expired service key or permissions) preventing agent/worker progress.

## Fix plan (RECOMMENDATIONS ONLY)
1. Obtain SSH access to VPS and run the safe diagnostics from the instruction list.
2. Verify DNS for `admin-api.novaciv.space` (A/AAAA/CNAME) and check propagation/expiry.
3. On VPS: check `pm2 status` and logs for `nova-ops-agent`, `nova-admin-domovoy`, `nova-video`.
4. On VPS: verify `ss -lntp` for bound admin API port and nginx proxy health.
5. Confirm repo deployment state on VPS (`git status`, `git log -1`) matches expected version.
6. If DNS or PM2 is broken, fix root cause (record updates, service configuration) and then restart processes (as a separate, approved step).
7. If Firebase reads fail, verify admin SDK credentials and permissions on VPS, then recheck queues (`videoJobs`, `newsMeta`, `featureFlags`).

## Safe commands used
- `git log -20 --oneline`
- `curl.exe -sS -o NUL -w "%{http_code} %{time_total}\n" https://novaciv.space/.netlify/functions/health`
- `curl.exe -sS -o NUL -w "%{http_code} %{time_total}\n" https://novaciv.space/.netlify/functions/admin-proxy`
- `curl.exe -sS -o NUL -w "%{http_code} %{time_total}\n" https://admin-api.novaciv.space/health`
- `curl.exe -sS -o NUL -w "%{http_code} %{time_total}\n" https://admin-api.novaciv.space/`
- `gh auth status` (failed: GitHub CLI not installed)
- Local reads: `netlify.toml`, `netlify/functions-lite/*` (read-only)
