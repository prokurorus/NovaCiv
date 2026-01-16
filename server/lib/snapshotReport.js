// server/lib/snapshotReport.js
//
// Generates a system stability report from system_snapshot.json via OpenAI.
// Safe by default: never returns secrets, always sanitizes snapshot text.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const SNAPSHOT_SCRIPT_REL = path.join("runbooks", "snapshot_system.sh");
const SNAPSHOT_JSON_REL = path.join("_state", "system_snapshot.json");
const REPORT_MD_REL = path.join("_state", "system_report.md");
const REPORT_JSON_REL = path.join("_state", "system_report.json");

function sanitizeText(text) {
  if (!text) return "";
  return text
    .replace(/sk-[a-zA-Z0-9]{20,}/g, "sk-***")
    .replace(/ghp_[a-zA-Z0-9]{20,}/g, "ghp_***")
    .replace(/AIza[0-9A-Za-z_-]{35}/g, "AIza***")
    .replace(/GOCSPX-[^"'\s]+/g, "GOCSPX-***")
    .replace(/-----BEGIN[^-]+-----[\s\S]*?-----END[^-]+-----/g, "***PRIVATE_KEY***")
    .replace(/"token"\s*:\s*"[^"]+"/gi, '"token":"***"')
    .replace(/"apiKey"\s*:\s*"[^"]+"/gi, '"apiKey":"***"')
    .replace(/"password"\s*:\s*"[^"]+"/gi, '"password":"***"');
}

function ensureReportLabel(reportText, timestamp) {
  const trimmed = (reportText || "").trim();
  let output = trimmed;
  const label = "отчет по устойчивости системы";
  if (!trimmed.toLowerCase().startsWith(label)) {
    output = `${label}\n\n${trimmed}`;
  }
  if (timestamp && !/Время сбора данных:/i.test(output)) {
    output = `${output}\n\nВремя сбора данных: ${timestamp}`;
  }
  return output.trim();
}

function runSnapshotScript(projectDir) {
  const scriptPath = path.join(projectDir, SNAPSHOT_SCRIPT_REL);
  if (!fs.existsSync(scriptPath)) {
    return {
      success: false,
      output: "",
      error: `Snapshot script not found: ${scriptPath}`,
    };
  }
  try {
    const output = execSync(`bash "${scriptPath}"`, {
      cwd: projectDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { success: true, output, error: "" };
  } catch (error) {
    return {
      success: false,
      output: error.stdout || "",
      error: error.stderr || error.message,
    };
  }
}

function readSnapshotJson(projectDir) {
  const snapshotPath = path.join(projectDir, SNAPSHOT_JSON_REL);
  if (!fs.existsSync(snapshotPath)) {
    throw new Error(`Snapshot JSON not found: ${snapshotPath}`);
  }
  const raw = fs.readFileSync(snapshotPath, "utf8");
  const sanitizedRaw = sanitizeText(raw);
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    data = JSON.parse(sanitizedRaw);
  }
  const timestamp = data && typeof data.timestamp === "string" ? data.timestamp : null;
  return {
    snapshotPath,
    raw,
    sanitizedRaw,
    data,
    timestamp,
  };
}

function buildReportPrompt(snapshotText, timestamp) {
  const safeTimestamp = timestamp || "unknown";
  const systemPrompt = `
Ты — Admin Domovoy, операционный помощник NovaCiv.
Твоя задача: по JSON-снимку системы дать краткий отчет о устойчивости.
Никогда не выводи секреты, токены, ключи, пароли или raw-JSON.
Пиши по-русски, коротко и по делу.
`.trim();

  const userPrompt = `
Сформируй отчет по устойчивости системы.
Формат обязателен:
- Первая строка: "отчет по устойчивости системы"
- Далее блоки: CPU, RAM, Disk, Network, PM2, Cron, Git, Snapshot, Firebase/Netlify (если есть данные).
- Для каждого блока используй один из шаблонов:
  * "Этот блок в норме"
  * "Этот блок ... (кратко, что важно)"
  * "В этом блоке проблемы: ... (кратко + рекомендация)"
- В конце строка: "Время сбора данных: ${safeTimestamp}"

JSON-снимок (для анализа, не вставляй его в ответ):
\`\`\`json
${snapshotText}
\`\`\`
`.trim();

  return { systemPrompt, userPrompt };
}

async function requestOpenAIReport({ openaiApiKey, snapshotText, timestamp, model }) {
  if (!openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  const { systemPrompt, userPrompt } = buildReportPrompt(snapshotText, timestamp);
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 600,
    }),
  });

  if (!resp.ok) {
    const errorText = await resp.text().catch(() => "");
    throw new Error(`OpenAI error ${resp.status}: ${errorText.slice(0, 200)}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || "";
  if (!content || !content.trim()) {
    throw new Error("OpenAI returned empty report");
  }
  return content.trim();
}

async function generateSnapshotReport({ projectDir, openaiApiKey, model }) {
  const { sanitizedRaw, data, timestamp } = readSnapshotJson(projectDir);
  const reportText = await requestOpenAIReport({
    openaiApiKey,
    snapshotText: sanitizeText(sanitizedRaw),
    timestamp,
    model,
  });
  const finalReport = ensureReportLabel(reportText, timestamp);
  return {
    reportText: finalReport,
    snapshot: data,
    snapshotTimestamp: timestamp,
    modelUsed: model || DEFAULT_MODEL,
  };
}

function saveSnapshotReport({ projectDir, reportText, snapshotTimestamp }) {
  const reportPath = path.join(projectDir, REPORT_MD_REL);
  const reportJsonPath = path.join(projectDir, REPORT_JSON_REL);
  const payload = {
    generatedAt: new Date().toISOString(),
    snapshotTimestamp: snapshotTimestamp || null,
    report: reportText,
  };
  fs.writeFileSync(reportPath, `${reportText}\n`, "utf8");
  fs.writeFileSync(reportJsonPath, JSON.stringify(payload, null, 2), "utf8");
  return { reportPath, reportJsonPath };
}

module.exports = {
  runSnapshotScript,
  readSnapshotJson,
  generateSnapshotReport,
  saveSnapshotReport,
  sanitizeText,
  ensureReportLabel,
};
