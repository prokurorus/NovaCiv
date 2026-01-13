// server/nova-news-worker.js
//
// News processing worker for PM2
// Processes jobs from Firebase queue (/newsJobs/pending)
//
// Architecture:
// 1) Pulls pending jobs from /newsJobs/pending
// 2) Claims job atomically (moves to /newsJobs/claimed)
// 3) Processes job (fetch-news or news-cron logic)
// 4) Marks job as done or failed

// Load .env with absolute path
const path = require("path");
const envPath = process.env.ENV_PATH || 
  (process.platform === 'win32' ? path.join(__dirname, '..', '.env') : '/root/NovaCiv/.env');
require("dotenv").config({ path: envPath });

const { getDatabase } = require("./config/firebase-config");

const logger = console;

// Initialize Firebase
try {
  getDatabase(logger);
  logger.log("[news-worker] Firebase initialized");
} catch (error) {
  logger.error("[news-worker] Failed to initialize Firebase:", error);
  process.exit(1);
}

const db = getDatabase(logger);
const newsJobsRef = db.ref("newsJobs");

// Import processing modules (will be created)
// For now, we'll implement basic structure

/**
 * Processes a fetch-news job
 * @param {Object} job - Job data
 * @returns {Promise<Object>} Results
 */
async function processFetchNews(job) {
  logger.log("[news-worker] Processing fetch-news job", job.jobId);
  
  // TODO: Implement fetch-news logic
  // This should:
  // 1. Fetch RSS feeds
  // 2. Score and filter news
  // 3. Analyze with OpenAI
  // 4. Save to Firebase forum/topics
  // 5. Update newsMeta
  
  // For now, return placeholder
  return {
    ok: true,
    processed: 0,
    message: "fetch-news processing not yet implemented",
  };
}

/**
 * Processes a news-cron job
 * @param {Object} job - Job data
 * @returns {Promise<Object>} Results
 */
async function processNewsCron(job) {
  logger.log("[news-worker] Processing news-cron job", job.jobId);
  
  // TODO: Implement news-cron logic
  // This should:
  // 1. Fetch news topics from Firebase
  // 2. Format messages
  // 3. Post to Telegram channels
  // 4. Mark topics as posted
  
  // For now, return placeholder
  return {
    ok: true,
    processed: 0,
    message: "news-cron processing not yet implemented",
  };
}

/**
 * Processes one job from the queue
 * @returns {Promise<void>}
 */
async function processOneJob() {
  logger.log("[news-worker] Checking for pending jobs...");

  try {
    // Get pending jobs
    const pendingSnapshot = await newsJobsRef
      .child("pending")
      .orderByChild("createdAt")
      .limitToFirst(1)
      .once("value");

    const pendingJobs = pendingSnapshot.val();
    if (!pendingJobs || Object.keys(pendingJobs).length === 0) {
      logger.log("[news-worker] No pending jobs");
      return;
    }

    const [jobId, jobData] = Object.entries(pendingJobs)[0];
    const job = { ...jobData, jobId };

    logger.log("[news-worker] Found job:", jobId, "requestedBy:", job.requestedBy);

    // Atomically claim the job
    const workerId = `pm2-${process.pid}-${Date.now()}`;
    const jobPendingRef = newsJobsRef.child(`pending/${jobId}`);
    const jobClaimedRef = newsJobsRef.child(`claimed/${jobId}`);

    // Try to move from pending to claimed atomically
    const transactionResult = await jobPendingRef.transaction((current) => {
      if (!current) {
        // Job was already claimed or deleted
        return null;
      }
      // Remove from pending (return null to delete)
      return null;
    });

    if (!transactionResult.committed) {
      logger.log("[news-worker] Failed to claim job (already claimed)", jobId);
      return;
    }

    // Move to claimed
    await jobClaimedRef.set({
      ...job,
      claimedAt: Date.now(),
      workerId,
    });

    logger.log("[news-worker] Successfully claimed job", jobId, "worker:", workerId);

    // Process the job
    let results = null;
    try {
      const requestedBy = job.requestedBy || "";
      
      if (requestedBy === "fetch-news" || requestedBy === "ops-run-now") {
        // For ops-run-now, we might need to process both fetch-news and news-cron
        // For now, treat ops-run-now as fetch-news
        results = await processFetchNews(job);
      } else if (requestedBy === "news-cron") {
        results = await processNewsCron(job);
      } else {
        // Default: try fetch-news
        logger.log("[news-worker] Unknown requestedBy, defaulting to fetch-news");
        results = await processFetchNews(job);
      }

      // Move to done
      const jobDoneRef = newsJobsRef.child(`done/${jobId}`);
      await jobDoneRef.set({
        ...job,
        doneAt: Date.now(),
        workerId,
        resultsSummary: results,
      });

      // Remove from claimed
      await jobClaimedRef.remove();

      logger.log("[news-worker] Job completed successfully", jobId);
    } catch (error) {
      logger.error("[news-worker] Error processing job", jobId, error);

      // Move to failed
      const jobFailedRef = newsJobsRef.child(`failed/${jobId}`);
      await jobFailedRef.set({
        ...job,
        failedAt: Date.now(),
        workerId,
        error: String(error && error.message ? error.message : error),
      });

      // Remove from claimed
      await jobClaimedRef.remove();

      logger.log("[news-worker] Job marked as failed", jobId);
    }
  } catch (error) {
    logger.error("[news-worker] Error in processOneJob", error);
  }
}

/**
 * Main loop
 */
async function loop() {
  logger.log("[news-worker] Loop started");

  while (true) {
    try {
      await processOneJob();
    } catch (e) {
      logger.error("[news-worker] Loop error", e);
    }

    // Check every 10 seconds
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
}

// Start the worker
loop().catch((err) => {
  logger.error("[news-worker] Fatal error", err);
  process.exit(1);
});
