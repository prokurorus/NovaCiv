// scripts/sanitize-admin-history.js
//
// One-time sanitization script to clean admin conversation history
// Replaces stored history for threadId "ruslan-main" with a clean seed
// that enforces desired DIRECT mode behavior.
//
// SAFETY: Never prints secrets, tokens, or full conversation content

const { getDb } = require("../server/lib/firebaseAdmin");

const THREAD_ID = "ruslan-main";

// Clean seed conversation pairs that enforce desired behavior
const CLEAN_SEED_PAIRS = [
  {
    user: {
      text: "что делать дальше?",
      ts: Date.now() - 86400000 * 7, // 7 days ago
    },
    assistant: {
      text: "Критичных проблем не видно. Варианты:\nA) Проверить статус новостного пайплайна\nB) Посмотреть метрики сайта\nC) Обновить контент\n\nКакой вариант выбираешь? (A/B/C)",
      ts: Date.now() - 86400000 * 7 + 5000,
    },
  },
  {
    user: {
      text: "A",
      ts: Date.now() - 86400000 * 6,
    },
    assistant: {
      text: "Проверяю статус пайплайна. Последний запуск был вчера, новости обработаны. Следующий шаг: проверить логи последнего выполнения на наличие ошибок. Продолжать?",
      ts: Date.now() - 86400000 * 6 + 3000,
    },
  },
  {
    user: {
      text: "почему мы получили 504 вчера и что изменили?",
      ts: Date.now() - 86400000 * 3,
    },
    assistant: {
      text: "Не уверен в точных изменениях без проверки кода. Возможно, это связано с таймаутами. Проверю конфигурацию таймаутов в функциях. Что именно ты видел в логах?",
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
      text: "настрой мониторинг и GA",
      ts: Date.now() - 86400000 * 1,
    },
    assistant: {
      text: "Не настраиваю мониторинг, GA, CI/CD, Trello, Jira или другие инструменты без явного запроса и контекста. Если нужна настройка — опиши конкретную задачу и что именно требуется.",
      ts: Date.now() - 86400000 * 1 + 3000,
    },
  },
];

async function sanitizeAdminHistory() {
  try {
    console.log(`[sanitize] Starting sanitization for thread: ${THREAD_ID}`);
    
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

    console.log(`[sanitize] Current state: ${oldMessageCount} messages, ${oldPairCount} pairs`);

    // 2. Delete all existing messages
    await baseRef.child("messages").remove();
    console.log(`[sanitize] Deleted ${oldMessageCount} old messages`);

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
          origin: "sanitize-script",
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
          origin: "sanitize-script",
        },
      });
      messageCount++;
    }

    console.log(`[sanitize] Wrote ${messageCount} new messages (${CLEAN_SEED_PAIRS.length} pairs)`);

    // 4. Update counters
    const newPairCount = CLEAN_SEED_PAIRS.length;
    await baseRef.child("counters").set({
      pairCount: newPairCount,
      lastSummarizedPairCount: 0, // Reset summarization
    });
    console.log(`[sanitize] Updated counters: pairCount=${newPairCount}, lastSummarizedPairCount=0`);

    // 5. Clear summaries (level1 and level2)
    await baseRef.child("summaries").remove();
    console.log(`[sanitize] Cleared all summaries`);

    // 6. Update state
    const now = Date.now();
    await baseRef.child("state").set({
      lastMessageTs: now,
      lastSummaryTs: null,
    });
    console.log(`[sanitize] Updated state: lastMessageTs=${now}`);

    console.log(`[sanitize] ✓ Sanitization complete`);
    console.log(`[sanitize] Summary: ${oldPairCount} pairs → ${newPairCount} pairs`);
    console.log(`[sanitize] Messages: ${oldMessageCount} → ${messageCount}`);

  } catch (error) {
    console.error(`[sanitize] Error:`, error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  sanitizeAdminHistory()
    .then(() => {
      console.log(`[sanitize] Done`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(`[sanitize] Fatal error:`, error.message);
      process.exit(1);
    });
}

module.exports = { sanitizeAdminHistory };
