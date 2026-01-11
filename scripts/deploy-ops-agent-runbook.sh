#!/bin/bash
# Deploy ops agent runbook and tools to server
# Usage: bash scripts/deploy-ops-agent-runbook.sh

ssh root@77.42.36.198 "bash -lc '
set -euo pipefail
cd /root/NovaCiv

echo \"== 1) Make docs/runbook ==\"
mkdir -p docs server/tools

cat > docs/OPS_AGENT_RUNBOOK.md <<\"MD\"
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
MD

echo \"== 2) Create self-check script ==\"
cat > server/tools/selfcheck-github.sh <<\"SH\"
#!/usr/bin/env bash
set -euo pipefail
cd /root/NovaCiv

node - <<\"NODE\"
require(\"dotenv\").config({ path: \"/root/NovaCiv/.env\", override: true });
const axios = require(\"axios\");

const t = process.env.GITHUB_TOKEN || \"\";
console.log(\"token_len=\", t.length, \"head=\", t.slice(0,4), \"tail=\", t.slice(-4));

axios.get(\"https://api.github.com/user\", {
  headers: {
    Authorization: \"token \" + t,
    Accept: \"application/vnd.github+json\"
  }
}).then(r => {
  console.log(\"GITHUB_OK\", r.status, r.data.login);
}).catch(e => {
  console.log(\"GITHUB_ERR\", e.response?.status, JSON.stringify(e.response?.data || e.message));
  process.exit(2);
});
NODE
SH
chmod +x server/tools/selfcheck-github.sh

echo \"== 3) Safety: keep only main .env, archive other .env* copies ==\"
mkdir -p /root/NovaCiv/.env-archive
for f in /root/NovaCiv/.env.BACKUP.* /root/NovaCiv/.env.save /root/NovaCiv/.env.backup /root/NovaCiv/.env.old 2>/dev/null; do
  [ -e \"$f\" ] && mv -f \"$f\" /root/NovaCiv/.env-archive/ || true
done

echo \"== 4) Restart agent with updated env + show status ==\"
pm2 restart nova-ops-agent --update-env
pm2 ls

echo \"== 5) Run self-check + show last logs ==\"
bash server/tools/selfcheck-github.sh || true
pm2 logs nova-ops-agent --lines 60 --nostream | tail -n 60 || true

echo \"✅ Done\"
' "
