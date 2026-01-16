#!/bin/bash
# snapshot_system.sh
# System snapshot generator for NovaCiv
# Collects system state WITHOUT secrets
# Outputs: JSON and MD formats
#
# SECURITY: Never includes:
# - process.env or pm2_env dumps
# - .env file contents
# - Firebase/OpenAI/GitHub/YouTube/Telegram tokens
# - Service account JSON
# - Any secrets or credentials

set -euo pipefail

STATE_DIR="/root/NovaCiv/_state"
REPO_DIR="/root/NovaCiv"
LOG_FILE="/var/log/novaciv_snapshot.log"

mkdir -p "$STATE_DIR"

# Red-flag secret patterns (case-insensitive)
SECRET_PATTERNS=(
  "BEGIN PRIVATE KEY"
  "BEGIN RSA PRIVATE KEY"
  "BEGIN EC PRIVATE KEY"
  "BEGIN CERTIFICATE"
  "AIza[0-9A-Za-z_-]{35}"  # Google API key pattern
  "sk-[a-zA-Z0-9]{32,}"    # OpenAI API key
  "ghp_[a-zA-Z0-9]{36}"    # GitHub personal access token
  "gho_[a-zA-Z0-9]{36}"
  "ghu_[a-zA-Z0-9]{36}"
  "ghs_[a-zA-Z0-9]{36}"
  "xoxb-[0-9-]+-[0-9A-Za-z]{24,}"  # Slack bot token
  "xoxp-[0-9-]+-[0-9A-Za-z]{24,}"  # Slack user token
  "-----BEGIN"
  "access_token[=:]"
  "refresh_token[=:]"
  "serviceAccount"
  "FIREBASE_SERVICE_ACCOUNT_JSON"
  "GOOGLE_APPLICATION_CREDENTIALS"
  "service_account"
  "private_key"
  "client_secret"
  "GOCSPX-"
  "1//"
  "eyJ[a-zA-Z0-9_-]{20,}\\.eyJ[a-zA-Z0-9_-]{20,}\\.[a-zA-Z0-9_-]{20,}"  # JWT token pattern
)

# Function to check for secret patterns
check_for_secrets() {
  local content="$1"
  local has_secrets=0
  local matched_patterns=()
  
  # Check each pattern individually (avoiding grep option conflicts)
  for pattern in "${SECRET_PATTERNS[@]}"; do
    # Use grep with -- for safety
    if echo "$content" | grep --text -qiE "$pattern" 2>/dev/null; then
      has_secrets=1
      matched_patterns+=("$pattern")
    fi
  done
  
  if [ $has_secrets -eq 1 ]; then
    echo "[SECURITY] Secret patterns detected: ${matched_patterns[*]}" >&2
    return 1
  fi
  
  return 0
}

# Function to sanitize content (replace secrets with [REDACTED])
sanitize_content() {
  local content="$1"
  
  # Remove process.env dumps
  content=$(echo "$content" | sed -E 's/process\.env\.[A-Z_]+[=:][^[:space:]]+/[REDACTED]/gi')
  
  # Remove pm2_env dumps
  content=$(echo "$content" | grep -v "pm2_env" || echo "$content")
  
  # Remove key=value patterns with suspicious keys (do this first to catch most cases)
  content=$(echo "$content" | sed -E 's/(token|key|secret|password|api[_-]?key|auth[_-]?token|refresh[_-]?token|access[_-]?token|client[_-]?secret|private[_-]?key|service[_-]?account)[=:][^[:space:]]{20,}/[REDACTED]/gi')
  
  # Remove specific secret patterns (avoid problematic patterns with dashes)
  content=$(echo "$content" | sed -E 's/BEGIN PRIVATE KEY/[REDACTED]/gi')
  content=$(echo "$content" | sed -E 's/BEGIN RSA PRIVATE KEY/[REDACTED]/gi')
  content=$(echo "$content" | sed -E 's/BEGIN EC PRIVATE KEY/[REDACTED]/gi')
  content=$(echo "$content" | sed -E 's/BEGIN CERTIFICATE/[REDACTED]/gi')
  content=$(echo "$content" | sed -E 's/AIza[0-9A-Za-z_-]{35}/[REDACTED]/g')
  content=$(echo "$content" | sed -E 's/sk-[a-zA-Z0-9]{32,}/[REDACTED]/g')
  content=$(echo "$content" | sed -E 's/ghp_[a-zA-Z0-9]{36}/[REDACTED]/g')
  content=$(echo "$content" | sed -E 's/gho_[a-zA-Z0-9]{36}/[REDACTED]/g')
  content=$(echo "$content" | sed -E 's/ghu_[a-zA-Z0-9]{36}/[REDACTED]/g')
  content=$(echo "$content" | sed -E 's/ghs_[a-zA-Z0-9]{36}/[REDACTED]/g')
  content=$(echo "$content" | sed -E 's/GOCSPX-[^[:space:]]+/[REDACTED]/gi')
  content=$(echo "$content" | sed -E 's/1\/\/[^[:space:]]+/[REDACTED]/g')
  content=$(echo "$content" | sed -E 's/serviceAccount[=:][^[:space:]]+/[REDACTED]/gi')
  content=$(echo "$content" | sed -E 's/FIREBASE_SERVICE_ACCOUNT_JSON[=:][^[:space:]]+/[REDACTED]/gi')
  content=$(echo "$content" | sed -E 's/GOOGLE_APPLICATION_CREDENTIALS[=:][^[:space:]]+/[REDACTED]/gi')
  
  echo "$content"
}

# Timestamp
TIMESTAMP=$(date -Is)
DATE_HUMAN=$(date '+%Y-%m-%d %H:%M:%S %Z')
START_EPOCH=$(date +%s)

# System info
HOSTNAME=$(hostname)
UPTIME=$(uptime -s 2>/dev/null || echo "unknown")

# Repo path sanity check
REPO_PATH_CHECK=""
if [ -d "$REPO_DIR" ]; then
  REPO_PATH_CHECK="valid"
else
  REPO_PATH_CHECK="missing"
fi

# Node/PM2 versions
NODE_VERSION=$(node -v 2>/dev/null || echo "not installed")
PM2_VERSION=$(pm2 -v 2>/dev/null || echo "not installed")

# PM2 status (table format only, NO jlist/describe/env)
PM2_LIST_TABLE=$(pm2 list 2>/dev/null || echo "PM2 not available")
PM2_STATUS_SUMMARY=$(pm2 status 2>/dev/null | grep -E "^(id|│|└|┌)" || echo "PM2 not available")

# Disk usage (df -h)
DISK_USAGE=$(df -h / 2>/dev/null | tail -1 || echo "disk info unavailable")
DISK_USAGE_ALL=$(df -h 2>/dev/null | head -20 || echo "disk info unavailable")
DISK_INODE_USAGE=$(df -ih 2>/dev/null | head -20 || echo "inode info unavailable")
DISK_KEY_MOUNTS=$(for m in / /var /home /root /mnt /data /srv; do if df -h "$m" &>/dev/null; then df -h "$m" | tail -1; fi; done | head -10 || echo "no key mounts found")
IO_LATENCY=$(if command -v iostat &> /dev/null; then iostat -xd 1 1 2>/dev/null | head -20; else echo "iostat not available"; fi)

# Memory usage (free -h)
MEMORY_USAGE=$(free -h 2>/dev/null | head -2 || echo "memory info unavailable")
MEMORY_DETAILED=$(free -m 2>/dev/null | head -3 || echo "memory info unavailable")
SWAP_USAGE=$(free -h 2>/dev/null | awk 'NR==3 {print $0}' || echo "swap info unavailable")
RSS_TOP=$(ps -eo pid,comm,rss --sort=-rss 2>/dev/null | head -6 || echo "rss info unavailable")

# CPU usage
LOAD_AVG=$(awk '{print $1" "$2" "$3}' /proc/loadavg 2>/dev/null || uptime 2>/dev/null | awk -F'load average:' '{print $2}' | xargs || echo "unavailable")
CPU_STEAL_RAW=$(awk 'NR==1 {print $9}' /proc/stat 2>/dev/null || echo "unknown")
CPU_STEAL_PCT=$(awk 'NR==1 {total=0; for(i=2;i<=NF;i++){total+=$i;} steal=$9; if (total>0) {printf "%.2f", (steal/total)*100} else {print "0.00"} }' /proc/stat 2>/dev/null || echo "unknown")
CPU_TOP=$(ps -eo pid,comm,%cpu --sort=-%cpu 2>/dev/null | head -6 || echo "cpu info unavailable")

# Cron status (list crontab entries without env)
CRON_STATUS=""
if command -v crontab &> /dev/null; then
  CRON_ENTRIES=$(crontab -l 2>/dev/null | grep -v "^#" | grep -v "^$" | head -20 || echo "no crontab entries")
  CRON_STATUS="$CRON_ENTRIES"
else
  CRON_STATUS="crontab not available"
fi

# Snapshot cron last run (from log)
SNAPSHOT_LAST_LOG=$(tail -1 "$LOG_FILE" 2>/dev/null || echo "no snapshot log")
SNAPSHOT_LAST_TIME=$(echo "$SNAPSHOT_LAST_LOG" | awk -F']' '{print $1}' | tr -d '[')
SNAPSHOT_LAST_STATUS=$(echo "$SNAPSHOT_LAST_LOG" | sed 's/.*] //')
SNAPSHOT_LAST_DURATION=$(echo "$SNAPSHOT_LAST_LOG" | grep -oE 'duration=[0-9]+s' | cut -d= -f2 || echo "unknown")

# Git info (NO remote URL with tokens)
cd "$REPO_DIR" 2>/dev/null || cd / || true
GIT_BRANCH=$(git -C "$REPO_DIR" branch --show-current 2>/dev/null || echo "unknown")
GIT_COMMIT=$(git -C "$REPO_DIR" rev-parse HEAD 2>/dev/null || echo "unknown")
GIT_COMMIT_SHORT=$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_STATUS=$(git -C "$REPO_DIR" status --porcelain 2>/dev/null || echo "")
GIT_CLEAN=$(if [ -z "$GIT_STATUS" ]; then echo "clean"; else echo "dirty"; fi)
# Remote URL without showing it (just check if it exists)
GIT_REMOTE_EXISTS="unknown"
if git -C "$REPO_DIR" remote get-url origin &> /dev/null; then
  GIT_REMOTE_EXISTS="configured"
else
  GIT_REMOTE_EXISTS="not configured"
fi

# Git ahead/behind
GIT_AHEAD=$(git -C "$REPO_DIR" rev-list --count HEAD..origin/main 2>/dev/null || echo "0")
GIT_BEHIND=$(git -C "$REPO_DIR" rev-list --count origin/main..HEAD 2>/dev/null || echo "0")

# Health endpoints check
HEALTH_ENDPOINTS=""
if [ -f "$REPO_DIR/netlify/functions/health-news.js" ]; then
  HEALTH_ENDPOINTS="${HEALTH_ENDPOINTS}health-news "
fi
if [ -f "$REPO_DIR/netlify/functions/health-domovoy.js" ]; then
  HEALTH_ENDPOINTS="${HEALTH_ENDPOINTS}health-domovoy "
fi
if [ -z "$HEALTH_ENDPOINTS" ]; then
  HEALTH_ENDPOINTS="none configured"
fi

# PM2 logs (last 80 lines, with aggressive sanitization)
PM2_LOGS_OPS_RAW=$(pm2 logs nova-ops-agent --lines 80 --nostream 2>/dev/null | tail -80 || echo "")
PM2_LOGS_OPS=$(sanitize_content "$PM2_LOGS_OPS_RAW")

PM2_LOGS_VIDEO_RAW=$(pm2 logs nova-video --lines 80 --nostream 2>/dev/null | tail -80 || echo "")
PM2_LOGS_VIDEO=$(sanitize_content "$PM2_LOGS_VIDEO_RAW")

# Network stats
NET_DEV_RAW=$(cat /proc/net/dev 2>/dev/null | tail -n +3 || echo "net dev info unavailable")
NET_TRAFFIC_SUMMARY=$(awk 'NR>2{rx+=$2; tx+=$10; rxerr+=$4; txerr+=$12} END{print "rx_bytes="rx" tx_bytes="tx" rx_err="rxerr" tx_err="txerr}' /proc/net/dev 2>/dev/null || echo "net summary unavailable")
NET_CONN_SUMMARY=$(ss -s 2>/dev/null || netstat -s 2>/dev/null | head -20 || echo "net conn summary unavailable")
NET_CONN_STATES=$(ss -tan 2>/dev/null | awk 'NR>1{state[$1]++} END{for (s in state) print s": "state[s]}' | sort || echo "connection states unavailable")

# Node event loop lag (best-effort)
EVENT_LOOP_LAG=$(node -e "try{const { monitorEventLoopDelay }=require('perf_hooks');const h=monitorEventLoopDelay({resolution:20});h.enable();setTimeout(()=>{h.disable();const mean=(h.mean/1e6).toFixed(2);const max=(h.max/1e6).toFixed(2);console.log('mean_ms='+mean+' max_ms='+max);},200);}catch(e){console.log('not available');}" 2>/dev/null || echo "not available")

# Firebase/DB metrics (best-effort, no secrets output)
FIREBASE_METRICS=$(node -e "try{const fs=require('fs');const path='${REPO_DIR}/.env';if(!fs.existsSync(path)){console.log('not configured');process.exit(0);}require('dotenv').config({path});if(!process.env.FIREBASE_SERVICE_ACCOUNT_JSON||!process.env.FIREBASE_DB_URL){console.log('not configured');process.exit(0);}let admin;try{admin=require('firebase-admin');}catch(e){console.log('firebase-admin not installed');process.exit(0);}const sa=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);admin.initializeApp({credential: admin.credential.cert(sa), databaseURL: process.env.FIREBASE_DB_URL});const db=admin.database();const start=Date.now();db.ref('.info/serverTimeOffset').once('value').then(()=>{console.log('latency_ms='+(Date.now()-start));process.exit(0);}).catch(err=>{console.log('error='+String(err.message||err));process.exit(0);});}catch(e){console.log('firebase metrics unavailable');}" 2>/dev/null || echo "firebase metrics unavailable")

# Netlify Functions metrics (best-effort, no secrets output)
NETLIFY_METRICS="not configured"

# Build JSON (sanitize all content)
JSON_OUTPUT=$(cat <<EOF
{
  "timestamp": "$TIMESTAMP",
  "date": "$DATE_HUMAN",
  "system": {
    "hostname": "$HOSTNAME",
    "uptime_since": "$UPTIME"
  },
  "repo": {
    "path": "$REPO_DIR",
    "path_check": "$REPO_PATH_CHECK"
  },
  "versions": {
    "node": "$NODE_VERSION",
    "pm2": "$PM2_VERSION"
  },
  "cpu": {
    "load_average": "$LOAD_AVG",
    "steal_pct": "$CPU_STEAL_PCT",
    "steal_raw": "$CPU_STEAL_RAW",
    "top_processes": "$(echo "$CPU_TOP" | jq -Rs . 2>/dev/null || echo "\"$(echo "$CPU_TOP" | sed 's/"/\\"/g')\"")"
  },
  "memory": {
    "usage": "$(echo "$MEMORY_USAGE" | jq -Rs . 2>/dev/null || echo "\"$(echo "$MEMORY_USAGE" | sed 's/"/\\"/g')\"")",
    "detailed": "$(echo "$MEMORY_DETAILED" | jq -Rs . 2>/dev/null || echo "\"$(echo "$MEMORY_DETAILED" | sed 's/"/\\"/g')\"")",
    "swap": "$(echo "$SWAP_USAGE" | jq -Rs . 2>/dev/null || echo "\"$(echo "$SWAP_USAGE" | sed 's/"/\\"/g')\"")",
    "top_rss_processes": "$(echo "$RSS_TOP" | jq -Rs . 2>/dev/null || echo "\"$(echo "$RSS_TOP" | sed 's/"/\\"/g')\"")"
  },
  "disk": {
    "usage_root": "$(echo "$DISK_USAGE" | jq -Rs . 2>/dev/null || echo "\"$(echo "$DISK_USAGE" | sed 's/"/\\"/g')\"")",
    "usage_all": "$(echo "$DISK_USAGE_ALL" | jq -Rs . 2>/dev/null || echo "\"$(echo "$DISK_USAGE_ALL" | sed 's/"/\\"/g')\"")",
    "inode_usage": "$(echo "$DISK_INODE_USAGE" | jq -Rs . 2>/dev/null || echo "\"$(echo "$DISK_INODE_USAGE" | sed 's/"/\\"/g')\"")",
    "key_mounts_free": "$(echo "$DISK_KEY_MOUNTS" | jq -Rs . 2>/dev/null || echo "\"$(echo "$DISK_KEY_MOUNTS" | sed 's/"/\\"/g')\"")",
    "io_latency": "$(echo "$IO_LATENCY" | jq -Rs . 2>/dev/null || echo "\"$(echo "$IO_LATENCY" | sed 's/"/\\"/g')\"")"
  },
  "network": {
    "traffic_summary": "$NET_TRAFFIC_SUMMARY",
    "interfaces": "$(echo "$NET_DEV_RAW" | jq -Rs . 2>/dev/null || echo "\"$(echo "$NET_DEV_RAW" | sed 's/"/\\"/g')\"")",
    "connection_summary": "$(echo "$NET_CONN_SUMMARY" | jq -Rs . 2>/dev/null || echo "\"$(echo "$NET_CONN_SUMMARY" | sed 's/"/\\"/g')\"")",
    "connection_states": "$(echo "$NET_CONN_STATES" | jq -Rs . 2>/dev/null || echo "\"$(echo "$NET_CONN_STATES" | sed 's/"/\\"/g')\"")"
  },
  "pm2": {
    "status_table": "$(echo "$PM2_LIST_TABLE" | jq -Rs . 2>/dev/null || echo "\"$(echo "$PM2_LIST_TABLE" | sed 's/"/\\"/g')\"")",
    "status_summary": "$(echo "$PM2_STATUS_SUMMARY" | jq -Rs . 2>/dev/null || echo "\"$(echo "$PM2_STATUS_SUMMARY" | sed 's/"/\\"/g')\"")",
    "event_loop_lag": "$EVENT_LOOP_LAG"
  },
  "resources": {
    "disk_usage": "$(echo "$DISK_USAGE" | jq -Rs . 2>/dev/null || echo "\"$(echo "$DISK_USAGE" | sed 's/"/\\"/g')\"")",
    "memory_usage": "$(echo "$MEMORY_USAGE" | jq -Rs . 2>/dev/null || echo "\"$(echo "$MEMORY_USAGE" | sed 's/"/\\"/g')\"")"
  },
  "cron": {
    "status": "$(echo "$CRON_STATUS" | jq -Rs . 2>/dev/null || echo "\"$(echo "$CRON_STATUS" | sed 's/"/\\"/g')\"")",
    "snapshot_last_time": "$SNAPSHOT_LAST_TIME",
    "snapshot_last_status": "$(echo "$SNAPSHOT_LAST_STATUS" | jq -Rs . 2>/dev/null || echo "\"$(echo "$SNAPSHOT_LAST_STATUS" | sed 's/"/\\"/g')\"")",
    "snapshot_last_duration": "$SNAPSHOT_LAST_DURATION"
  },
  "firebase_db": {
    "metrics": "$(echo "$FIREBASE_METRICS" | jq -Rs . 2>/dev/null || echo "\"$(echo "$FIREBASE_METRICS" | sed 's/"/\\"/g')\"")"
  },
  "netlify_functions": {
    "metrics": "$(echo "$NETLIFY_METRICS" | jq -Rs . 2>/dev/null || echo "\"$(echo "$NETLIFY_METRICS" | sed 's/"/\\"/g')\"")"
  },
  "critical_checks": {
    "repo_clean": "$(if [ "$GIT_CLEAN" = "clean" ]; then echo "ok"; else echo "FAIL: dirty repo"; fi)",
    "pm2_processes": "$(if echo "$PM2_LIST_TABLE" | grep -q "online"; then echo "ok"; else echo "FAIL: no online processes"; fi)",
    "snapshot_cron_active": "$(if crontab -l 2>/dev/null | grep -q "snapshot_system.sh"; then echo "ok"; else echo "FAIL: cron not active"; fi)",
    "health_endpoints_configured": "$(if [ -n "$HEALTH_ENDPOINTS" ] && [ "$HEALTH_ENDPOINTS" != "none configured" ]; then echo "ok"; else echo "WARN: no endpoints"; fi)"
  },
  "git": {
    "branch": "$GIT_BRANCH",
    "commit": "$GIT_COMMIT",
    "commit_short": "$GIT_COMMIT_SHORT",
    "status": "$GIT_CLEAN",
    "redFlag": "$(if [ "$GIT_CLEAN" = "dirty" ]; then echo "true"; else echo "false"; fi)",
    "remote_exists": "$GIT_REMOTE_EXISTS",
    "ahead": $GIT_AHEAD,
    "behind": $GIT_BEHIND
  },
  "health_endpoints": {
    "configured": "$HEALTH_ENDPOINTS"
  },
  "logs": {
    "nova-ops-agent": "$(echo "$PM2_LOGS_OPS" | jq -Rs . 2>/dev/null || echo "\"$(echo "$PM2_LOGS_OPS" | sed 's/"/\\"/g')\"")",
    "nova-video": "$(echo "$PM2_LOGS_VIDEO" | jq -Rs . 2>/dev/null || echo "\"$(echo "$PM2_LOGS_VIDEO" | sed 's/"/\\"/g')\"")"
  }
}
EOF
)

# Build MD (sanitize all content)
MD_OUTPUT=$(cat <<EOF
# NovaCiv System Snapshot

**Generated:** $DATE_HUMAN  
**Timestamp:** $TIMESTAMP

---

## System

- **Hostname:** $HOSTNAME
- **Uptime since:** $UPTIME

---

## Repo Path

- **Path:** $REPO_DIR
- **Status:** $REPO_PATH_CHECK

---

## Versions

- **Node.js:** $NODE_VERSION
- **PM2:** $PM2_VERSION

---

## CPU

- **Load average:** $LOAD_AVG
- **CPU steal:** $CPU_STEAL_PCT% (raw: $CPU_STEAL_RAW)

### Top processes by %CPU

\`\`\`
$CPU_TOP
\`\`\`

---

## Memory

### Usage

\`\`\`
$MEMORY_USAGE
\`\`\`

### Detailed (MB)

\`\`\`
$MEMORY_DETAILED
\`\`\`

### Swap

\`\`\`
$SWAP_USAGE
\`\`\`

### Top processes by RSS

\`\`\`
$RSS_TOP
\`\`\`

---

## Disk

### Usage (root)

\`\`\`
$DISK_USAGE
\`\`\`

### Usage (all)

\`\`\`
$DISK_USAGE_ALL
\`\`\`

### Inode Usage

\`\`\`
$DISK_INODE_USAGE
\`\`\`

### Key Mounts Free Space

\`\`\`
$DISK_KEY_MOUNTS
\`\`\`

### I/O Latency (best-effort)

\`\`\`
$IO_LATENCY
\`\`\`

---

## Network

### Traffic Summary

\`\`\`
$NET_TRAFFIC_SUMMARY
\`\`\`

### Interface Counters

\`\`\`
$NET_DEV_RAW
\`\`\`

### Connection Summary

\`\`\`
$NET_CONN_SUMMARY
\`\`\`

### Connection States

\`\`\`
$NET_CONN_STATES
\`\`\`

---

## PM2 / Node

- **Event loop lag:** $EVENT_LOOP_LAG

### PM2 Status

\`\`\`
$PM2_LIST_TABLE
\`\`\`

---

## Cron / Jobs

- **Last snapshot run:** $SNAPSHOT_LAST_TIME
- **Last snapshot status:** $SNAPSHOT_LAST_STATUS
- **Last snapshot duration:** $SNAPSHOT_LAST_DURATION

### Crontab Entries

\`\`\`
$CRON_STATUS
\`\`\`

---

## Firebase / DB (best-effort)

\`\`\`
$FIREBASE_METRICS
\`\`\`

---

## Netlify Functions (best-effort)

\`\`\`
$NETLIFY_METRICS
\`\`\`

---

## Git Status

- **Branch:** $GIT_BRANCH
- **Commit:** $GIT_COMMIT_SHORT ($GIT_COMMIT)
- **Status:** $GIT_CLEAN$(if [ "$GIT_CLEAN" = "dirty" ]; then echo " ⚠️ RED FLAG: Violation of pull-only mode"; fi)
- **Remote:** $GIT_REMOTE_EXISTS
- **Ahead of origin/main:** $GIT_AHEAD commits
- **Behind origin/main:** $GIT_BEHIND commits

---

## Health Endpoints

- **Configured:** $HEALTH_ENDPOINTS

---

## PM2 Logs: nova-ops-agent

\`\`\`
$PM2_LOGS_OPS
\`\`\`

---

## PM2 Logs: nova-video

\`\`\`
$PM2_LOGS_VIDEO
\`\`\`

---

*Generated by snapshot_system.sh (hardened, no secrets)*
EOF
)

# Check for secrets in output
SNAPSHOT_CONTENT="${JSON_OUTPUT}${MD_OUTPUT}"
SNAPSHOT_TAINTED=0

if ! check_for_secrets "$SNAPSHOT_CONTENT"; then
  SNAPSHOT_TAINTED=1
  echo "[$TIMESTAMP] [SECURITY] Snapshot contains secret patterns - marking as tainted" >> "$LOG_FILE" 2>&1 || true
  
  # Sanitize output again
  JSON_OUTPUT=$(sanitize_content "$JSON_OUTPUT")
  MD_OUTPUT=$(sanitize_content "$MD_OUTPUT")
  
  # Add taint marker
  JSON_OUTPUT=$(echo "$JSON_OUTPUT" | sed 's/"timestamp":/"tainted": true, "timestamp":/')
  MD_OUTPUT=$(echo "$MD_OUTPUT" | sed 's/# NovaCiv System Snapshot/# ⚠️ NovaCiv System Snapshot (TAINTED - secrets detected)/')
fi

# Save files
echo "$JSON_OUTPUT" > "$STATE_DIR/system_snapshot.json"
echo "$MD_OUTPUT" > "$STATE_DIR/system_snapshot.md"

# Execution duration
END_EPOCH=$(date +%s)
RUN_DURATION_SEC=$((END_EPOCH - START_EPOCH))
RUN_DURATION_TEXT="${RUN_DURATION_SEC}s"

# Log execution
if [ $SNAPSHOT_TAINTED -eq 1 ]; then
  echo "[$TIMESTAMP] Snapshot generated with SECURITY WARNINGS (tainted) duration=${RUN_DURATION_TEXT}" >> "$LOG_FILE" 2>&1 || true
  exit 1  # Exit with error code to trigger monitoring
else
  echo "[$TIMESTAMP] Snapshot generated successfully (clean) duration=${RUN_DURATION_TEXT}" >> "$LOG_FILE" 2>&1 || true
  exit 0
fi
