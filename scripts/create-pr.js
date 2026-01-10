#!/usr/bin/env node
// scripts/create-pr.js
// Создает PR через GitHub API

const path = require("path");
const envPath = process.env.ENV_PATH || 
  (process.platform === 'win32' ? path.join(__dirname, '..', '.env') : '/root/NovaCiv/.env');
require("dotenv").config({ path: envPath });

const axios = require("axios");
const { execSync } = require("child_process");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
  console.error("❌ GITHUB_TOKEN not found in environment");
  console.log("Please set GITHUB_TOKEN in .env file or environment variables");
  process.exit(1);
}

// Автоматическое определение owner/repo из git remote
function getGitHubRepo() {
  try {
    const remoteUrl = execSync("git remote get-url origin", {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8",
    }).trim();
    
    const match = remoteUrl.match(/(?:github\.com[/:]|@github\.com:)([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }
  } catch (error) {
    // Ignore
  }
  
  return {
    owner: process.env.GITHUB_OWNER || "prokurorus",
    repo: process.env.GITHUB_REPO || "NovaCiv"
  };
}

const { owner, repo } = getGitHubRepo();

async function createPR() {
  try {
    const response = await axios.post(
      `https://api.github.com/repos/${owner}/${repo}/pulls`,
      {
        title: "feat(ops-agent): Add aliases, fuzzy matching, and improved command parsing",
        head: "ops-agent-ux-improvements",
        base: "main",
        body: `## Changes

### 1. Aliases and Auto-correction
- Added command aliases (status, report, pm2 -> report:status, etc.)
- Implemented fuzzy matching (Levenshtein distance) for typos
- Commands can now be written in multiple ways

### 2. Improved Command Parser
- Search command in Issue title
- If not found, search in body first line
- If still not found, search in first author comment
- Returns first valid command found

### 3. Enhanced Responses
- Always shows "Recognized input" in responses
- Always shows "Resolved command" in responses
- Shows "Did you mean" suggestions (1-3 closest matches) for unknown commands

### 4. Updated Help/Available Commands
- Shows aliases for each command
- Formatted list with examples

### 5. Test Script
- Added \`scripts/test-ops-agent-aliases.js\` for validation
- Tests all aliases and fuzzy matching scenarios

## Examples

- \`status\`, \`report\`, \`pm2\`, \`health\` -> \`report:status\`
- \`youtube:refresh\`, \`yt:refresh\`, \`yt refresh\` -> \`youtube:refresh-test\`
- \`restart\`, \`worker restart\`, \`restart worker\` -> \`worker:restart\`
- \`test job\`, \`run test\`, \`pipeline test\` -> \`pipeline:run-test-job\`
- \`validate video\`, \`video validate\` -> \`video:validate\`

## Testing

All tests pass:
\`\`\`
✅ Passed: 35
❌ Failed: 0
📊 Total:  35
\`\`\`

Run tests: \`node scripts/test-ops-agent-aliases.js\``,
        maintainer_can_modify: true
      },
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    console.log("✅ PR created successfully!");
    console.log(`   URL: ${response.data.html_url}`);
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error("❌ Failed to create PR:");
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Message: ${JSON.stringify(error.response.data, null, 2)}`);
      
      if (error.response.status === 422 && error.response.data.errors) {
        // PR уже существует или другие ошибки валидации
        if (error.response.data.errors.some(e => e.message && e.message.includes("already exists"))) {
          console.log("\n   ℹ️  PR may already exist. Check:");
          console.log(`   https://github.com/${owner}/${repo}/pulls`);
        }
      }
    } else {
      console.error("❌ Error:", error.message);
    }
    process.exit(1);
  }
}

createPR();
