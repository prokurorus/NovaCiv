// server/lib/stabilityReport.js
//
// Generates stability report via OpenAI using sanitized telemetry JSON.

const { sanitizeTelemetry } = require("./sanitizeTelemetry");

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function buildPrompt(telemetry) {
  const safeTelemetry = sanitizeTelemetry(telemetry);
  const telemetryText = JSON.stringify(safeTelemetry, null, 2);

  const systemPrompt = `
Ты — операционный помощник NovaCiv.
Твоя задача: кратко оценить устойчивость системы по телеметрии.
Никогда не выводи секреты, ключи, токены, пароли.
Ответ — краткий, без длинных рассуждений.
`.trim();

  const userPrompt = `
Сформируй отчёт по формату:

Заголовок: NovaCiv — Отчет устойчивости системы
Дата/время: <ISO>

Блоки (в этом порядке): Repo/Deploy, PM2, CPU, RAM, Disk, Network, Cron, Health
Для каждого блока: ✅ OK / ⚠️ Warning / ❌ Problem
Если проблема: 1–2 строки причины + 1–2 строки "что сделать"

Никаких длинных рассуждений и лишнего текста.

Телеметрия (только для анализа, не вставляй в ответ):
\`\`\`json
${telemetryText}
\`\`\`
`.trim();

  return { systemPrompt, userPrompt };
}

async function generateStabilityReport(sanitizedTelemetry) {
  const safeTelemetry = sanitizeTelemetry(sanitizedTelemetry);
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const { systemPrompt, userPrompt } = buildPrompt(safeTelemetry);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 700,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`OpenAI error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();
  const reportMd = data?.choices?.[0]?.message?.content?.trim() || "";
  if (!reportMd) {
    throw new Error("OpenAI returned empty report");
  }

  return {
    reportMd,
    model: data?.model || DEFAULT_MODEL,
    usage: data?.usage || null,
    createdAt: new Date().toISOString(),
  };
}

module.exports = {
  generateStabilityReport,
};
