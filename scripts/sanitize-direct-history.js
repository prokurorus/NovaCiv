// scripts/sanitize-direct-history.js
//
// One-time sanitization script to clean admin direct conversation history
// Replaces stored history for threadId "ruslan-direct" with a clean seed
// that enforces desired DIRECT mode behavior.
//
// SAFETY: Never prints secrets, tokens, or full conversation content

const { getDb } = require("../server/lib/firebaseAdmin");

const THREAD_ID = "ruslan-direct";

// Clean seed conversation pairs that enforce desired behavior
// IMPORTANT: NO mentions of monitoring, Grafana, Prometheus, Google Analytics, 
// CI/CD, Trello, Jira, PM2 (not even as examples)
const CLEAN_SEED_PAIRS = [
  {
    user: {
      text: "что делать дальше?",
      ts: Date.now() - 86400000 * 7, // 7 days ago
    },
    assistant: {
      text: "Критичных проблем не видно.\n\nВыбери цель: (A) админка/домовой (B) форум/UX (C) контент/постинг\n\nНазови букву — дам один шаг.",
      ts: Date.now() - 86400000 * 7 + 5000,
    },
  },
  {
    user: {
      text: "A",
      ts: Date.now() - 86400000 * 6,
    },
    assistant: {
      text: "Проверяю статус админки. Последний запрос был успешным. Следующий шаг: проверить логи последних запросов на наличие ошибок. Продолжать?",
      ts: Date.now() - 86400000 * 6 + 3000,
    },
  },
  {
    user: {
      text: "почему мы получили 504 вчера и что изменили?",
      ts: Date.now() - 86400000 * 3,
    },
    assistant: {
      text: "Не уверен в точных изменениях без проверки кода и логов. Возможно, это связано с таймаутами или нагрузкой. Что именно ты видел в логах?",
      ts: Date.now() - 86400000 * 3 + 4000,
    },
  },
  {
    user: {
      text: "как дела с деплоем?",
      ts: Date.now() - 86400000 * 2,
    },
    assistant: {
      text: "Деплой прошел успешно. Изменения применены. Нужна проверка конкретной функции или все работает?",
      ts: Date.now() - 86400000 * 2 + 2000,
    },
  },
  {
    user: {
      text: "что улучшить в форуме?",
      ts: Date.now() - 86400000 * 1,
    },
    assistant: {
      text: "Можно улучшить навигацию по темам или добавить фильтры по категориям. Какой аспект форума тебя больше всего беспокоит?",
      ts: Date.now() - 86400000 * 1 + 3000,
    },
  },
];

async function sanitizeDirectHistory() {
  try {
    console.log(`[sanitize-direct] Starting sanitization for thread: ${THREAD_ID}`);
    
    const db = getDb();
    const baseRef = db.ref("adminConversations").child(THREAD_ID);

    // 1. Get current state (for logging only)
    const [messagesSnap, countersSnap] = await Promise.all([
      baseRef.child("messages").once("value"),
      baseRef.child("counters").once("value"),
    ]);

    const oldMessages = messagesSnap.val() || {};
    const oldCounters = countersSnap.val() || {};
    const oldPairCount = typeof oldCounters.pairCount === "number" ? oldCounters.pairCount : 0;
    const oldMessageCount = Object.keys(oldMessages).length;

    console.log(`[sanitize-direct] Current state: ${oldMessageCount} messages, ${oldPairCount} pairs`);

    // 2. Delete all existing messages
    await baseRef.child("messages").remove();
    console.log(`[sanitize-direct] Deleted ${oldMessageCount} old messages`);

    // 3. Write clean seed messages
    const messagesRef = baseRef.child("messages");
    let messageCount = 0;
    
    for (const pair of CLEAN_SEED_PAIRS) {
      // User message
      const userRef = messagesRef.push();
      await userRef.set({
        role: "user",
        text: pair.user.text,
        ts: pair.user.ts,
        meta: {
          origin: "sanitize-direct-script",
        },
      });
      messageCount++;

      // Assistant message
      const assistantRef = messagesRef.push();
      await assistantRef.set({
        role: "assistant",
        text: pair.assistant.text,
        ts: pair.assistant.ts,
        meta: {
          origin: "sanitize-direct-script",
        },
      });
      messageCount++;
    }

    console.log(`[sanitize-direct] Wrote ${messageCount} new messages (${CLEAN_SEED_PAIRS.length} pairs)`);

    // 4. Update counters
    const newPairCount = CLEAN_SEED_PAIRS.length;
    await baseRef.child("counters").set({
      pairCount: newPairCount,
      lastSummarizedPairCount: 0, // Reset summarization
    });
    console.log(`[sanitize-direct] Updated counters: pairCount=${newPairCount}, lastSummarizedPairCount=0`);

    // 5. Clear summaries (level1 and level2)
    await baseRef.child("summaries").remove();
    console.log(`[sanitize-direct] Cleared all summaries`);

    // 6. Update state
    const now = Date.now();
    await baseRef.child("state").set({
      lastMessageTs: now,
      lastSummaryTs: null,
    });
    console.log(`[sanitize-direct] Updated state: lastMessageTs=${now}`);

    console.log(`[sanitize-direct] ✓ Sanitization complete`);
    console.log(`[sanitize-direct] Summary: ${oldPairCount} pairs → ${newPairCount} pairs`);
    console.log(`[sanitize-direct] Messages: ${oldMessageCount} → ${messageCount}`);

  } catch (error) {
    console.error(`[sanitize-direct] Error:`, error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  sanitizeDirectHistory()
    .then(() => {
      console.log(`[sanitize-direct] Done`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(`[sanitize-direct] Fatal error:`, error.message);
      process.exit(1);
    });
}

module.exports = { sanitizeDirectHistory };
