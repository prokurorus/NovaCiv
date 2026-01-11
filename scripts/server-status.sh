#!/usr/bin/env bash
set -euo pipefail

echo "=========================================="
echo "  NovaCiv Server Status"
echo "=========================================="
echo "Time: $(date -Is)"
echo "Host: $(hostname) | User: $(whoami)"
echo "PWD: $(pwd)"
echo

# Git status
echo "=== GIT STATUS ==="
if [ -d "/root/NovaCiv" ]; then
  cd /root/NovaCiv
  echo "Branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'N/A')"
  echo "Commit: $(git rev-parse --short HEAD 2>/dev/null || echo 'N/A')"
  echo "Status:"
  git status -sb 2>/dev/null || echo "  (not a git repo or error)"
else
  echo "  /root/NovaCiv not found"
fi
echo

# PM2 Status
echo "=== PM2 PROCESSES ==="
pm2 list 2>/dev/null || echo "  PM2 not running or not installed"
echo

# PM2 Process Details
echo "=== PM2 PROCESS DETAILS ==="
if pm2 list >/dev/null 2>&1; then
  echo "-- nova-ops-agent --"
  pm2 describe nova-ops-agent 2>/dev/null | head -n 15 || echo "  Process not found"
  echo
  
  echo "-- nova-video --"
  pm2 describe nova-video 2>/dev/null | head -n 15 || echo "  Process not found"
  echo
fi

# Recent Logs Summary
echo "=== RECENT LOGS (last 20 lines) ==="
if pm2 list >/dev/null 2>&1; then
  echo "-- nova-ops-agent --"
  pm2 logs nova-ops-agent --lines 20 --nostream 2>/dev/null | tail -n 20 || echo "  No logs available"
  echo
  
  echo "-- nova-video --"
  pm2 logs nova-video --lines 20 --nostream 2>/dev/null | tail -n 20 || echo "  No logs available"
  echo
fi

# System Resources
echo "=== SYSTEM RESOURCES ==="
echo "Memory:"
free -h 2>/dev/null | grep -E "^Mem|^Swap" || echo "  free command not available"
echo
echo "Disk:"
df -h / 2>/dev/null | tail -n 1 || echo "  df command not available"
echo

# Listening Ports (if ss is available)
if command -v ss >/dev/null 2>&1; then
  echo "=== LISTENING PORTS (top 10) ==="
  ss -lntp 2>/dev/null | head -n 11 || echo "  ss command failed"
  echo
fi

echo "=========================================="
echo "Status check complete"
echo "=========================================="
