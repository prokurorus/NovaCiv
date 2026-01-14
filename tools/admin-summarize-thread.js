// tools/admin-summarize-thread.js
//
// CLI wrapper for hierarchical admin conversation summarizer.
// Safe to run locally or on VPS (requires Firebase Admin + OPENAI_API_KEY).
//
// Usage:
//   node tools/admin-summarize-thread.js            # default thread (ruslan-main)
//   node tools/admin-summarize-thread.js other-id   # custom threadId
//
// This script:
// - Checks adminConversations/{threadId}/counters.{pairCount,lastSummarizedPairCount}
// - If new pairs >= 100, generates a level1 summary for last ~100 pairs
// - Optionally merges level1 summaries into level2 if threshold exceeded

require("dotenv").config();

const {
  DEFAULT_THREAD_ID,
  checkAndSummarizeThread,
} = require("../server/lib/adminConversations");

async function main() {
  const threadIdArg = process.argv[2];
  const threadId = threadIdArg || DEFAULT_THREAD_ID;

  if (!process.env.OPENAI_API_KEY) {
    console.error(
      "[admin-summarize-thread] OPENAI_API_KEY is not set, cannot run summarizer.",
    );
    process.exit(1);
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  const openAiClient = async ({ role, content }) => {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role, content }],
        temperature: 0.2,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error(
        "[admin-summarize-thread] OpenAI error:",
        resp.status,
        text.slice(0, 200),
      );
      return "";
    }

    const data = await resp.json();
    return data.choices?.[0]?.message?.content || "";
  };

  try {
    console.log(
      `[admin-summarize-thread] Running summarizer for threadId="${threadId}"...`,
    );
    const result = await checkAndSummarizeThread({
      threadId,
      minNewPairs: 100,
      level1MergeThreshold: 10,
      openAiClient,
    });

    console.log("[admin-summarize-thread] Result:", {
      threadId: result.threadId,
      ran: result.ran,
      reason: result.reason,
      pairCount: result.pairCount,
      lastSummarizedPairCount: result.lastSummarizedPairCount,
      pendingPairs: result.pendingPairs,
      level2SummaryWritten: result.level2SummaryWritten || false,
    });
  } catch (e) {
    console.error(
      "[admin-summarize-thread] FATAL ERROR:",
      e && e.message ? e.message : e,
    );
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

