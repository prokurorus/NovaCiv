#!/usr/bin/env node
// Generate SSH command to deploy ops-agent v3
// Usage: node scripts/generate-deploy-ops-agent-v3-ssh.js

const fs = require("fs");
const path = require("path");

const opsAgentPath = path.join(__dirname, "..", "server", "ops-agent.js");
let v3Code = fs.readFileSync(opsAgentPath, "utf8");

// Normalize line endings to Unix format (remove \r)
v3Code = v3Code.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

// Use base64 encoding for safe transmission
const base64Code = Buffer.from(v3Code, "utf8").toString("base64");

const sshCommand = `ssh root@77.42.36.198 "bash -lc '
set -euo pipefail
cd /root/NovaCiv

# 1) откат к стабильному v2 (если v3 успел частично сломаться)
if [ -f server/ops-agent.v2.js ]; then
  pm2 delete nova-ops-agent 2>/dev/null || true
  pm2 start server/ops-agent.v2.js --name nova-ops-agent --update-env
  pm2 save
fi

# 2) создаём v3 ФАЙЛ через base64 (безопасно для PowerShell)
node - <<\"NODE\"
const fs = require(\"fs\");
const code = Buffer.from(\"${base64Code}\", \"base64\").toString(\"utf8\");
const p = \"server/ops-agent.v3.js\";
fs.writeFileSync(p, code, \"utf8\");
console.log(\"✅ wrote\", p, \"len=\", code.length);
NODE

# 3) проверка синтаксиса и переключение на v3
node -c server/ops-agent.v3.js
pm2 delete nova-ops-agent 2>/dev/null || true
pm2 start server/ops-agent.v3.js --name nova-ops-agent --update-env
pm2 save

pm2 logs nova-ops-agent --lines 30 --nostream | tail -n 30
echo \"✅ ops-agent v3 installed\"
' "`;

console.log(sshCommand);
