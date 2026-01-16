#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/root/NovaCiv"
LOG_FILE="/var/log/novaciv_stability_report.log"

cd "$PROJECT_DIR"

# Cron example (UTC):
# 0 3 * * * bash /root/NovaCiv/runbooks/stability_report_daily.sh >> /var/log/novaciv_stability_report.log 2>&1

{
  echo "=== stability report: $(date -u +"%Y-%m-%dT%H:%M:%SZ") ==="
  node server/ops-stability-report.js
  echo "=== done ==="
} >> "$LOG_FILE" 2>&1
