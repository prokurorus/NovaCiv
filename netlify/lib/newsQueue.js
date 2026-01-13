// netlify/lib/newsQueue.js
//
// Utility for enqueueing news processing jobs to Firebase queue
// Used by Netlify functions to quickly enqueue jobs and return

const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;

/**
 * Enqueues a news processing job to Firebase
 * @param {Object} options - Job options
 * @param {string} options.requestedBy - Who requested the job (e.g., "ops-run-now", "fetch-news", "news-cron")
 * @param {boolean} options.dry - Whether this is a dry run
 * @param {string} [options.lang] - Optional language filter
 * @returns {Promise<{jobId: string, ok: boolean}>}
 */
async function enqueueNewsJob({ requestedBy, dry = false, lang = null }) {
  if (!FIREBASE_DB_URL) {
    throw new Error("FIREBASE_DB_URL is not set");
  }

  const jobId = `news-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const job = {
    createdAt: Date.now(),
    requestedBy,
    dry: dry === true || dry === "1" || dry === "true",
    ...(lang ? { lang } : {}),
  };

  try {
    const url = `${FIREBASE_DB_URL}/newsJobs/pending/${jobId}.json`;
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(job),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to enqueue job: HTTP ${res.status} – ${text}`);
    }

    return { jobId, ok: true };
  } catch (error) {
    console.error("[news-queue] Failed to enqueue job:", error.message);
    throw error;
  }
}

module.exports = {
  enqueueNewsJob,
};
