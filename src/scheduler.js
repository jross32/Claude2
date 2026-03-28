/**
 * Cron-based scheduled scraping using node-cron.
 */
const cron = require('node-cron');

const jobs = new Map();

function createSchedule(id, cronExpr, scrapeOptions, onComplete) {
  if (!cron.validate(cronExpr)) {
    throw new Error(`Invalid cron expression: ${cronExpr}`);
  }

  const task = cron.schedule(cronExpr, async () => {
    try {
      const jobEntry = jobs.get(id);
      if (!jobEntry) return;
      jobEntry.lastRun = new Date().toISOString();
      jobEntry.status = 'running';

      // Dynamic require to avoid circular dependency; scraper is loaded at call time
      const ScraperSession = require('./scraper');
      const sessionId = `sched-${id}-${Date.now()}`;
      const session = new ScraperSession(sessionId, () => {});
      const result = await session.run(scrapeOptions);

      jobEntry.status = 'idle';
      jobEntry.history.unshift({ runAt: jobEntry.lastRun, success: true, resultSummary: {
        pages: result.pages?.length || 0,
        graphql: result.apiCalls?.graphql?.length || 0,
        rest: result.apiCalls?.rest?.length || 0,
      }});
      // Keep last 20 history entries
      if (jobEntry.history.length > 20) jobEntry.history.length = 20;

      if (onComplete) onComplete(result, null);
    } catch (err) {
      const jobEntry = jobs.get(id);
      if (jobEntry) {
        jobEntry.status = 'error';
        jobEntry.lastError = err.message;
        jobEntry.history.unshift({ runAt: jobEntry.lastRun, success: false, error: err.message });
        if (jobEntry.history.length > 20) jobEntry.history.length = 20;
      }
      if (onComplete) onComplete(null, err);
    }
  }, { scheduled: false });

  jobs.set(id, {
    id,
    task,
    cronExpr,
    scrapeOptions,
    createdAt: new Date().toISOString(),
    lastRun: null,
    status: 'idle',
    lastError: null,
    history: [],
  });

  task.start();
  return id;
}

function deleteSchedule(id) {
  const job = jobs.get(id);
  if (!job) return false;
  job.task.stop();
  jobs.delete(id);
  return true;
}

function listSchedules() {
  return [...jobs.values()].map((j) => ({
    id: j.id,
    cronExpr: j.cronExpr,
    scrapeOptions: j.scrapeOptions,
    createdAt: j.createdAt,
    lastRun: j.lastRun,
    status: j.status,
    lastError: j.lastError,
    historyCount: j.history.length,
    recentHistory: j.history.slice(0, 5),
  }));
}

module.exports = { createSchedule, deleteSchedule, listSchedules, jobs };
