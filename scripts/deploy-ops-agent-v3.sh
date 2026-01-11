#!/bin/bash
# Deploy ops-agent v3 to server
# Usage: bash scripts/deploy-ops-agent-v3.sh

node scripts/generate-deploy-ops-agent-v3-ssh.js | bash
