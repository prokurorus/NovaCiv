#!/bin/bash
# snapshot_system_send_openai.sh
# Runs snapshot_system.sh and sends snapshot JSON to OpenAI to generate a report.
# Intended for daily cron usage.

set -euo pipefail

PROJECT_DIR="/root/NovaCiv"
LOG_FILE="/var/log/novaciv_snapshot_send.log"

SNAPSHOT_SCRIPT="${PROJECT_DIR}/runbooks/snapshot_system.sh"
REPORT_SCRIPT="${PROJECT_DIR}/server/ops-snapshot-report.js"

if [ ! -f "$SNAPSHOT_SCRIPT" ]; then
  echo "Snapshot script not found: $SNAPSHOT_SCRIPT" >&2
  exit 1
fi

if [ ! -f "$REPORT_SCRIPT" ]; then
  echo "Report script not found: $REPORT_SCRIPT" >&2
  exit 1
fi

echo "[$(date -Is)] Running snapshot + OpenAI report..." >> "$LOG_FILE"

# Run snapshot (system_snapshot.json)
bash "$SNAPSHOT_SCRIPT" >> "$LOG_FILE" 2>&1 || true

# Generate report via OpenAI (saves to _state/system_report.md/json)
node "$REPORT_SCRIPT" --no-print >> "$LOG_FILE" 2>&1

echo "[$(date -Is)] Done" >> "$LOG_FILE"
