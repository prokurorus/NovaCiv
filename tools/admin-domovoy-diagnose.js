// tools/admin-domovoy-diagnose.js
//
// VPS-only diagnostic script for nova-admin-domovoy context issues.
// Safe to run locally too (will just use local repo paths).
//
// It validates:
// - PROJECT_DIR / cwd resolution
// - Presence and readability of key docs/runbooks/_state files
// - Ability to build the memory pack used by server/admin-domovoy-api.js
//
// NEVER prints secrets or .env contents. Only prints env var NAMES and
// high-level status.

const fs = require("fs");
const path = require("path");

function logSection(title) {
  console.log("\n==============================");
  console.log(title);
  console.log("==============================");
}

function safeExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function readSafe(p) {
  try {
    if (!fs.existsSync(p)) return { ok: false, reason: "not_found" };
    const content = fs.readFileSync(p, "utf8");
    return { ok: true, content };
  } catch (e) {
    return { ok: false, reason: e.message || "read_error" };
  }
}

function main() {
  logSection("ENV & PATHS");

  const cwd = process.cwd();
  const envProjectDir = process.env.PROJECT_DIR;

  const defaultProjectDir = "/root/NovaCiv";
  const projectDir = envProjectDir || defaultProjectDir;

  console.log(`cwd: ${cwd}`);
  console.log(
    `PROJECT_DIR env: ${envProjectDir ? "SET (value hidden)" : "NOT SET"}`,
  );
  console.log(`Effective projectDir: ${projectDir}`);

  const docsDir = path.join(projectDir, "docs");
  const runbooksDir = path.join(projectDir, "runbooks");
  const stateDir = path.join(projectDir, "_state");

  console.log(`docsDir: ${docsDir} (exists=${safeExists(docsDir)})`);
  console.log(
    `runbooksDir: ${runbooksDir} (exists=${safeExists(runbooksDir)})`,
  );
  console.log(`stateDir: ${stateDir} (exists=${safeExists(stateDir)})`);

  logSection("CRITICAL FILES");

  const criticalFiles = [
    ["docs/ADMIN_ASSISTANT.md", path.join(docsDir, "ADMIN_ASSISTANT.md")],
    ["docs/PROJECT_CONTEXT.md", path.join(docsDir, "PROJECT_CONTEXT.md")],
    ["docs/PROJECT_STATE.md", path.join(docsDir, "PROJECT_STATE.md")],
  ];

  for (const [label, fullPath] of criticalFiles) {
    const exists = safeExists(fullPath);
    if (!exists) {
      console.log(`MISSING: ${label} @ ${fullPath}`);
    } else {
      const stat = fs.statSync(fullPath);
      console.log(
        `OK: ${label} (size=${stat.size} bytes, mtime=${stat.mtime.toISOString()})`,
      );
    }
  }

  logSection("IMPORTANT FILES");

  const importantFiles = [
    ["docs/START_HERE.md", path.join(docsDir, "START_HERE.md")],
    ["docs/RUNBOOKS.md", path.join(docsDir, "RUNBOOKS.md")],
    [
      "runbooks/SOURCE_OF_TRUTH.md",
      path.join(runbooksDir, "SOURCE_OF_TRUTH.md"),
    ],
  ];

  for (const [label, fullPath] of importantFiles) {
    const exists = safeExists(fullPath);
    if (!exists) {
      console.log(`WARN: ${label} missing @ ${fullPath}`);
    } else {
      const stat = fs.statSync(fullPath);
      console.log(
        `OK: ${label} (size=${stat.size} bytes, mtime=${stat.mtime.toISOString()})`,
      );
    }
  }

  logSection("STATE SNAPSHOT");

  const snapshotPath = path.join(stateDir, "system_snapshot.md");
  if (!safeExists(snapshotPath)) {
    console.log(`WARN: _state/system_snapshot.md missing @ ${snapshotPath}`);
  } else {
    const stat = fs.statSync(snapshotPath);
    console.log(
      `OK: _state/system_snapshot.md (size=${stat.size} bytes, mtime=${stat.mtime.toISOString()})`,
    );

    const snapshot = readSafe(snapshotPath);
    if (!snapshot.ok) {
      console.log(
        `ERROR: Failed to read snapshot: ${snapshot.reason || "unknown"}`,
      );
    } else {
      const lines = snapshot.content.split("\n");
      console.log(
        `Snapshot lines: ${lines.length}, tail preview (last 5 lines):`,
      );
      console.log(lines.slice(-5).join("\n"));
    }
  }

  logSection("MEMORY PACK SIMULATION");

  // Inline minimal version of server/admin-domovoy-api.js buildMemoryPack logic
  const memoryFiles = [];
  const MAX_TOTAL_CHARS = 120000;
  let totalChars = 0;

  function loadFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf8");
        return content;
      }
    } catch {
      // ignore here, we just return null
    }
    return null;
  }

  function sanitizeContent(content) {
    if (!content) return "";
    const patterns = [
      /sk-[a-zA-Z0-9]{20,}/g, // OpenAI keys
      /ghp_[a-zA-Z0-9]{36,}/g, // GitHub tokens
      /AIza[0-9A-Za-z_-]{35}/g, // Firebase keys
      /-----BEGIN (PRIVATE KEY|RSA PRIVATE KEY)-----[\s\S]*?-----END (PRIVATE KEY|RSA PRIVATE KEY)-----/g,
      /\"token\":\s*\"[^\"]+\"/gi,
      /\"apiKey\":\s*\"[^\"]+\"/gi,
      /\"password\":\s*\"[^\"]+\"/gi,
    ];

    let sanitized = content;
    patterns.forEach((pattern) => {
      sanitized = sanitized.replace(pattern, "[REDACTED]");
    });
    return sanitized;
  }

  const criticalList = [
    { path: path.join(docsDir, "ADMIN_ASSISTANT.md"), name: "ADMIN_ASSISTANT.md" },
    { path: path.join(docsDir, "PROJECT_CONTEXT.md"), name: "PROJECT_CONTEXT.md" },
    { path: path.join(docsDir, "PROJECT_STATE.md"), name: "PROJECT_STATE.md" },
  ];

  const importantList = [
    { path: path.join(docsDir, "START_HERE.md"), name: "START_HERE.md" },
    { path: path.join(docsDir, "RUNBOOKS.md"), name: "RUNBOOKS.md" },
    { path: path.join(runbooksDir, "SOURCE_OF_TRUTH.md"), name: "runbooks/SOURCE_OF_TRUTH.md" },
  ];

  // Critical
  for (const file of criticalList) {
    const content = loadFile(file.path);
    if (content) {
      const sanitized = sanitizeContent(content);
      memoryFiles.push({ name: file.name, content: sanitized });
      totalChars += sanitized.length;
      console.log(`Loaded critical ${file.name} (${sanitized.length} chars)`);
    } else {
      console.log(`ERROR: Failed to load critical file ${file.name} @ ${file.path}`);
    }
  }

  // Important
  for (const file of importantList) {
    if (totalChars >= MAX_TOTAL_CHARS) break;
    const content = loadFile(file.path);
    if (content) {
      const sanitized = sanitizeContent(content);
      const remaining = MAX_TOTAL_CHARS - totalChars;
      if (sanitized.length <= remaining) {
        memoryFiles.push({ name: file.name, content: sanitized });
        totalChars += sanitized.length;
        console.log(`Loaded important ${file.name} (${sanitized.length} chars)`);
      } else {
        memoryFiles.push({
          name: file.name,
          content: sanitized.slice(0, remaining) + "\n\n[... truncated ...]",
        });
        totalChars = MAX_TOTAL_CHARS;
        console.log(
          `Loaded important ${file.name} (truncated to ${remaining} chars, reached limit)`,
        );
        break;
      }
    } else {
      console.log(`WARN: Important file missing or unreadable: ${file.name} @ ${file.path}`);
    }
  }

  // Snapshot tail
  if (totalChars < MAX_TOTAL_CHARS && safeExists(snapshotPath)) {
    const snapshot = readSafe(snapshotPath);
    if (snapshot.ok) {
      const lines = snapshot.content.split("\n");
      const tailLines = lines.slice(-250).join("\n");
      const sanitized = sanitizeContent(tailLines);
      const remaining = MAX_TOTAL_CHARS - totalChars;
      if (sanitized.length <= remaining) {
        memoryFiles.push({
          name: "_state/system_snapshot.md (tail 250 lines)",
          content: sanitized,
        });
        totalChars += sanitized.length;
        console.log(
          `Loaded snapshot tail (250 lines, ${sanitized.length} chars), totalChars=${totalChars}`,
        );
      } else if (remaining > 100) {
        memoryFiles.push({
          name: "_state/system_snapshot.md (tail, truncated)",
          content: sanitized.slice(0, remaining) + "\n\n[... truncated ...]",
        });
        totalChars = MAX_TOTAL_CHARS;
        console.log(
          `Loaded snapshot tail truncated to ${remaining} chars, totalChars=${totalChars}`,
        );
      } else {
        console.log("Skipping snapshot tail: not enough remaining capacity");
      }
    } else {
      console.log(
        `WARN: Failed to read snapshot for memory pack: ${snapshot.reason || "unknown"}`,
      );
    }
  }

  console.log("\nMemory pack summary:");
  console.log(`  filesLoaded: ${memoryFiles.map((f) => f.name).join(", ")}`);
  console.log(`  totalChars: ${totalChars}`);

  if (!memoryFiles.length) {
    console.log(
      "\nRESULT: context_missing – memory pack is empty. Check docs/ and runbooks/ paths relative to PROJECT_DIR.",
    );
    process.exitCode = 1;
  } else {
    console.log(
      "\nRESULT: OK – memory pack built successfully. If you still see context_missing from the API, check server logs for runtime errors.",
    );
  }
}

main();

