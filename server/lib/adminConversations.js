// server/lib/adminConversations.js
// Admin Domovoy long-term memory helpers (Firebase RTDB)
// - Conversation logging (messages + counters + state)
// - Memory context (summaries + recent pairs)
// - Hierarchical summarization (level1 + level2)
//
// All data is stored under:
//   adminConversations/{threadId}/...
//
// IMPORTANT:
// - Never store secrets/tokens/keys here; only human text + metadata.

const { getDb } = require("./firebaseAdmin");

const DEFAULT_THREAD_ID = "ruslan-main";
const INVALID_KEY_CHARS = /[.#$[\]/]/g;

function safeKey(value, fallback = "unknown") {
  if (!value) return fallback;
  return String(value)
    .trim()
    .toLowerCase()
    .replace(INVALID_KEY_CHARS, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

function getEffectiveThreadId(rawThreadId) {
  const base =
    rawThreadId && typeof rawThreadId === "string"
      ? rawThreadId.trim()
      : DEFAULT_THREAD_ID;
  const safe = safeKey(base, DEFAULT_THREAD_ID);
  return safe || DEFAULT_THREAD_ID;
}

function getGitSha() {
  const candidates = [
    process.env.GIT_COMMIT,
    process.env.COMMIT_REF,
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.SHA,
  ];
  const sha = candidates.find((v) => v && typeof v === "string" && v.trim());
  return sha ? sha.trim() : null;
}

function getDbSafe() {
  return getDb();
}

// ---------- Conversation logging ----------

async function logUserMessage(options) {
  const {
    threadId: rawThreadId,
    text,
    ts = Date.now(),
    origin = "vps-admin",
  } = options || {};

  if (!text || typeof text !== "string") return null;

  const threadId = getEffectiveThreadId(rawThreadId);
  const db = getDbSafe();

  const messageRef = db
    .ref("adminConversations")
    .child(threadId)
    .child("messages")
    .push();

  const payload = {
    role: "user",
    text,
    ts,
    meta: {
      sha: getGitSha(),
      origin,
    },
  };

  await messageRef.set(payload);

  // Update state.lastMessageTs (best-effort)
  try {
    const stateRef = db
      .ref("adminConversations")
      .child(threadId)
      .child("state");
    await stateRef.update({
      lastMessageTs: ts,
    });
  } catch (e) {
    console.warn(
      "[adminConversations] Failed to update state.lastMessageTs:",
      e.message,
    );
  }

  return {
    threadId,
    messageId: messageRef.key,
    ts,
  };
}

async function logAssistantMessageAndIncrementPair(options) {
  const {
    threadId: rawThreadId,
    text,
    ts = Date.now(),
    origin = "vps-admin",
  } = options || {};

  if (!text || typeof text !== "string") return null;

  const threadId = getEffectiveThreadId(rawThreadId);
  const db = getDbSafe();
  const baseRef = db.ref("adminConversations").child(threadId);

  // 1) Save assistant message
  const messageRef = baseRef.child("messages").push();
  const payload = {
    role: "assistant",
    text,
    ts,
    meta: {
      sha: getGitSha(),
      origin,
    },
  };

  await messageRef.set(payload);

  // 2) Increment counters.pairCount atomically
  let pairCount = 0;
  let lastSummarizedPairCount = 0;
  try {
    const countersRef = baseRef.child("counters");
    await countersRef.transaction((current) => {
      const data = current || {};
      const currentPairCount =
        typeof data.pairCount === "number" ? data.pairCount : 0;
      const currentLastSummarized =
        typeof data.lastSummarizedPairCount === "number"
          ? data.lastSummarizedPairCount
          : 0;
      pairCount = currentPairCount + 1;
      lastSummarizedPairCount = currentLastSummarized;
      return {
        pairCount,
        lastSummarizedPairCount,
      };
    });
  } catch (e) {
    console.warn(
      "[adminConversations] Failed to update counters.pairCount:",
      e.message,
    );
  }

  // 3) Update state.lastMessageTs
  try {
    const stateRef = baseRef.child("state");
    await stateRef.update({
      lastMessageTs: ts,
    });
  } catch (e) {
    console.warn(
      "[adminConversations] Failed to update state.lastMessageTs:",
      e.message,
    );
  }

  return {
    threadId,
    messageId: messageRef.key,
    ts,
    pairCount,
    lastSummarizedPairCount,
  };
}

// ---------- Memory context helpers ----------

async function loadRecentPairs(threadId, maxPairs = 20) {
  const effectiveThreadId = getEffectiveThreadId(threadId);
  const db = getDbSafe();

  const messagesRef = db
    .ref("adminConversations")
    .child(effectiveThreadId)
    .child("messages");

  const snapshot = await messagesRef
    .orderByChild("ts")
    .limitToLast(maxPairs * 2)
    .once("value");

  const raw = snapshot.val() || {};
  const list = Object.entries(raw)
    .map(([id, value]) => ({
      id,
      ...(value || {}),
    }))
    .filter((m) => m && typeof m.text === "string")
    .sort((a, b) => {
      const ta = typeof a.ts === "number" ? a.ts : 0;
      const tb = typeof b.ts === "number" ? b.ts : 0;
      if (ta !== tb) return ta - tb;
      return a.id.localeCompare(b.id);
    });

  const pairs = [];
  let current = null;

  for (const msg of list) {
    if (msg.role === "user") {
      if (current) {
        pairs.push(current);
      }
      current = {
        user: { text: msg.text, ts: msg.ts },
        assistant: null,
      };
    } else if (msg.role === "assistant") {
      if (current && !current.assistant) {
        current.assistant = { text: msg.text, ts: msg.ts };
        pairs.push(current);
        current = null;
      } else {
        pairs.push({
          user: null,
          assistant: { text: msg.text, ts: msg.ts },
        });
        current = null;
      }
    }
  }
  if (current) {
    pairs.push(current);
  }

  const recentPairs = pairs.slice(-maxPairs);
  return {
    threadId: effectiveThreadId,
    pairs: recentPairs,
    pairCount: pairs.length,
  };
}

async function loadSummaries(threadId) {
  const effectiveThreadId = getEffectiveThreadId(threadId);
  const db = getDbSafe();
  const baseRef = db.ref("adminConversations").child(effectiveThreadId);

  const [level2Snap, level1Snap, stateSnap] = await Promise.all([
    baseRef.child("summaries").child("level2").once("value"),
    baseRef.child("summaries").child("level1").once("value"),
    baseRef.child("state").once("value"),
  ]);

  const level2Raw = level2Snap.val() || {};
  const level1Raw = level1Snap.val() || {};
  const state = stateSnap.val() || {};

  const level2 = Object.entries(level2Raw)
    .map(([id, v]) => ({ id, ...(v || {}) }))
    .filter((s) => typeof s.summary === "string")
    .sort((a, b) => {
      const ta = typeof a.ts === "number" ? a.ts : 0;
      const tb = typeof b.ts === "number" ? b.ts : 0;
      if (ta !== tb) return tb - ta;
      return b.id.localeCompare(a.id);
    });

  const level1 = Object.entries(level1Raw)
    .map(([id, v]) => ({ id, ...(v || {}) }))
    .filter((s) => typeof s.summary === "string")
    .sort((a, b) => {
      const ta = typeof a.ts === "number" ? a.ts : 0;
      const tb = typeof b.ts === "number" ? b.ts : 0;
      if (ta !== tb) return tb - ta;
      return b.id.localeCompare(a.id);
    });

  return {
    threadId: effectiveThreadId,
    level2,
    level1,
    lastSummaryTs: state.lastSummaryTs || null,
  };
}

async function buildAdminMemoryContext(options) {
  const { threadId: rawThreadId, maxPairs = 20 } = options || {};
  const threadId = getEffectiveThreadId(rawThreadId);

  let summaries;
  let recent;
  try {
    summaries = await loadSummaries(threadId);
  } catch (e) {
    console.warn(
      "[adminConversations] Failed to load summaries for memory context:",
      e.message,
    );
    summaries = {
      threadId,
      level1: [],
      level2: [],
      lastSummaryTs: null,
    };
  }

  try {
    recent = await loadRecentPairs(threadId, maxPairs);
  } catch (e) {
    console.warn(
      "[adminConversations] Failed to load recent pairs for memory context:",
      e.message,
    );
    recent = {
      threadId,
      pairs: [],
      pairCount: 0,
    };
  }

  const { level2, level1, lastSummaryTs } = summaries;
  const { pairs } = recent;

  let summaryBlocks = "";
  let summaryCount = 0;

  if (level2.length > 0) {
    summaryBlocks += "=== Admin conversation summaries (level2, newest first) ===\n\n";
    for (const s of level2) {
      summaryBlocks += `- Chunk ${s.id} (fromChunk=${s.fromChunk || "?"}, toChunk=${s.toChunk || "?"}, ts=${s.ts || "?"}):\n${s.summary}\n\n`;
      summaryCount++;
    }
  }

  if (level1.length > 0) {
    summaryBlocks += "=== Admin conversation summaries (level1, newest first) ===\n\n";
    for (const s of level1) {
      summaryBlocks += `- Chunk ${s.id} (fromPair=${s.fromPair || "?"}, toPair=${s.toPair || "?"}, ts=${s.ts || "?"}):\n${s.summary}\n\n`;
      summaryCount++;
    }
  }

  let recentBlocks = "";
  let recentPairCount = 0;
  if (pairs.length > 0) {
    recentBlocks += "=== Recent admin conversation (last pairs, newest last) ===\n\n";
    pairs.forEach((p, idx) => {
      const index = idx + 1;
      recentBlocks += `PAIR ${index}:\n`;
      if (p.user && typeof p.user.text === "string") {
        recentBlocks += `Admin: ${p.user.text}\n`;
      }
      if (p.assistant && typeof p.assistant.text === "string") {
        recentBlocks += `Assistant: ${p.assistant.text}\n`;
      }
      recentBlocks += "\n";
      recentPairCount++;
    });
  }

  return {
    threadId,
    summaryText: summaryBlocks,
    recentPairsText: recentBlocks,
    summaryCount,
    recentPairCount,
    lastSummaryTs,
  };
}

// ---------- Hierarchical summarizer ----------

async function checkAndSummarizeThread(options) {
  const {
    threadId: rawThreadId,
    minNewPairs = 100,
    level1MergeThreshold = 10,
    openAiClient,
  } = options || {};

  const threadId = getEffectiveThreadId(rawThreadId);
  const db = getDbSafe();
  const baseRef = db.ref("adminConversations").child(threadId);

  const countersSnap = await baseRef.child("counters").once("value");
  const counters = countersSnap.val() || {};
  const pairCount =
    typeof counters.pairCount === "number" ? counters.pairCount : 0;
  const lastSummarizedPairCount =
    typeof counters.lastSummarizedPairCount === "number"
      ? counters.lastSummarizedPairCount
      : 0;

  const pendingPairs = pairCount - lastSummarizedPairCount;
  if (pendingPairs < minNewPairs) {
    return {
      threadId,
      ran: false,
      reason: "threshold_not_met",
      pairCount,
      lastSummarizedPairCount,
      pendingPairs,
    };
  }

  const messagesSnap = await baseRef
    .child("messages")
    .orderByChild("ts")
    .limitToLast(minNewPairs * 2)
    .once("value");

  const raw = messagesSnap.val() || {};
  const list = Object.entries(raw)
    .map(([id, value]) => ({
      id,
      ...(value || {}),
    }))
    .filter((m) => typeof m.text === "string")
    .sort((a, b) => {
      const ta = typeof a.ts === "number" ? a.ts : 0;
      const tb = typeof b.ts === "number" ? b.ts : 0;
      if (ta !== tb) return ta - tb;
      return a.id.localeCompare(b.id);
    });

  const pairs = [];
  let current = null;

  for (const msg of list) {
    if (msg.role === "user") {
      if (current) {
        pairs.push(current);
      }
      current = {
        user: { text: msg.text, ts: msg.ts },
        assistant: null,
      };
    } else if (msg.role === "assistant") {
      if (current && !current.assistant) {
        current.assistant = { text: msg.text, ts: msg.ts };
        pairs.push(current);
        current = null;
      } else {
        pairs.push({
          user: null,
          assistant: { text: msg.text, ts: msg.ts },
        });
        current = null;
      }
    }
  }
  if (current) {
    pairs.push(current);
  }

  const recentPairs = pairs.slice(-minNewPairs);

  if (!recentPairs.length) {
    return {
      threadId,
      ran: false,
      reason: "no_pairs",
      pairCount,
      lastSummarizedPairCount,
      pendingPairs,
    };
  }

  const lines = [];
  lines.push(
    "You are summarizing an admin conversation for long-term operational memory.",
  );
  lines.push(
    "Extract concise, actionable information only (decisions, plans, tasks, open issues, resolved issues, next steps).",
  );
  lines.push(
    "Do NOT include any secrets, tokens, passwords, API keys, or long verbatim quotes.",
  );
  lines.push("Focus on what the admin decided and why.");
  lines.push("");
  lines.push("Conversation pairs (most recent last):");
  lines.push("");

  recentPairs.forEach((p, idx) => {
    const index = idx + 1;
    lines.push(`PAIR ${index}:`);
    if (p.user && typeof p.user.text === "string") {
      lines.push(`Admin: ${p.user.text}`);
    }
    if (p.assistant && typeof p.assistant.text === "string") {
      lines.push(`Assistant: ${p.assistant.text}`);
    }
    lines.push("");
  });

  const conversationText = lines.join("\n");

  const openai = openAiClient;
  if (!openai) {
    console.warn(
      "[adminConversations] checkAndSummarizeThread called without openAiClient – skipping summarization",
    );
    return {
      threadId,
      ran: false,
      reason: "no_openai_client",
      pairCount,
      lastSummarizedPairCount,
      pendingPairs,
    };
  }

  const completion = await openai({
    role: "system",
    content: conversationText,
  });

  const summary = completion && typeof completion === "string"
    ? completion
    : "";

  if (!summary.trim()) {
    console.warn(
      "[adminConversations] Summarizer returned empty summary, skipping write",
    );
    return {
      threadId,
      ran: false,
      reason: "empty_summary",
      pairCount,
      lastSummarizedPairCount,
      pendingPairs,
    };
  }

  const now = Date.now();
  const level1Ref = baseRef.child("summaries").child("level1").push();
  const fromPair = Math.max(1, pairCount - recentPairs.length + 1);
  const toPair = pairCount;

  await level1Ref.set({
    fromPair,
    toPair,
    summary,
    ts: now,
  });

  // Update counters.lastSummarizedPairCount and state.lastSummaryTs
  try {
    await baseRef.child("counters").update({
      lastSummarizedPairCount: toPair,
    });
  } catch (e) {
    console.warn(
      "[adminConversations] Failed to update lastSummarizedPairCount:",
      e.message,
    );
  }

  try {
    await baseRef.child("state").update({
      lastSummaryTs: now,
    });
  } catch (e) {
    console.warn(
      "[adminConversations] Failed to update state.lastSummaryTs:",
      e.message,
    );
  }

  // Level2 merge
  let level2SummaryWritten = false;
  try {
    const level1Snap = await baseRef
      .child("summaries")
      .child("level1")
      .once("value");
    const level1Raw = level1Snap.val() || {};
    const level1List = Object.entries(level1Raw)
      .map(([id, v]) => ({ id, ...(v || {}) }))
      .filter((s) => typeof s.summary === "string")
      .sort((a, b) => {
        const ta = typeof a.ts === "number" ? a.ts : 0;
        const tb = typeof b.ts === "number" ? b.ts : 0;
        if (ta !== tb) return ta - tb;
        return a.id.localeCompare(b.id);
      });

    if (level1List.length > level1MergeThreshold) {
      const toMerge = level1List.slice(0, level1List.length);

      const mergeLines = [];
      mergeLines.push(
        "You are summarizing multiple admin conversation summaries into a higher-level summary.",
      );
      mergeLines.push(
        "Keep it very concise and actionable. No secrets, no tokens, no long quotes.",
      );
      mergeLines.push("");
      mergeLines.push("Input summaries (oldest first):");
      mergeLines.push("");

      toMerge.forEach((s, idx) => {
        mergeLines.push(
          `SUMMARY ${idx + 1} (fromPair=${s.fromPair || "?"}, toPair=${
            s.toPair || "?"
          }, ts=${s.ts || "?"}):`,
        );
        mergeLines.push(s.summary);
        mergeLines.push("");
      });

      const mergeText = mergeLines.join("\n");
      const mergeCompletion = await openai({
        role: "system",
        content: mergeText,
      });
      const mergedSummary =
        mergeCompletion && typeof mergeCompletion === "string"
          ? mergeCompletion
          : "";

      if (mergedSummary.trim()) {
        const level2Ref = baseRef
          .child("summaries")
          .child("level2")
          .push();
        await level2Ref.set({
          fromChunk: toMerge[0].id,
          toChunk: toMerge[toMerge.length - 1].id,
          summary: mergedSummary,
          ts: Date.now(),
        });
        level2SummaryWritten = true;
      }
    }
  } catch (e) {
    console.warn(
      "[adminConversations] Failed during level2 merge:",
      e.message,
    );
  }

  return {
    threadId,
    ran: true,
    reason: "ok",
    pairCount,
    lastSummarizedPairCount: pairCount,
    pendingPairs,
    level2SummaryWritten,
  };
}

module.exports = {
  DEFAULT_THREAD_ID,
  getEffectiveThreadId,
  logUserMessage,
  logAssistantMessageAndIncrementPair,
  buildAdminMemoryContext,
  checkAndSummarizeThread,
};

