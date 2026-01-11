# NovaCiv Ops Agent — Runbook

## What it is
PM2 process: **nova-ops-agent**  
Polls GitHub Issues with label **ops** and executes only whitelisted commands.

## Key files
- server/ops-agent.js — agent code
- /root/NovaCiv/.env — environment (ENV_PATH points here)

## Quick checks (copy/paste on server)
### PM2 status
pm2 ls

### Tail logs
pm2 logs nova-ops-agent --lines 80 --nostream

### Token + GitHub API check
bash server/tools/selfcheck-github.sh

## Typical failure modes
### 401 Bad credentials (but token in .env is correct)
Cause: PM2 already had old env, and dotenv did not override existing vars.
Fix:
- ensure ops-agent uses dotenv with override:true
- restart with: pm2 restart nova-ops-agent --update-env
