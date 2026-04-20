'use strict';

/**
 * Cron-based scheduled scraping using node-cron.
 * Schedules are persisted to data/schedules.json and restored on startup.
 */

const cron = require('node-cron');
const fs   = require('fs');
const path = require('path');

const DATA_DIR     = path.join(__dirname, '..', 'data');
const PERSIST_FILE = path.join(DATA_DIR, 'schedules.json');

const jobs = new Map();

// ── Persistence helpers ───────────────────────────────────────────────────────

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function saveToDisk() {
  try {
    ensureDataDir();
    const serializable = [...jobs.values()].map(j => ({
      id:            j.id,
      label:         j.label || null,
      cronExpr:      j.cronExpr,
      scrapeOptions: j.scrapeOptions,
      createdAt:     j.createdAt,
      lastRun:       j.lastRun,
      lastError:     j.lastError,
      history:       j.history,
    }));
    fs.writeFileSync(PERSIST_FILE, JSON.stringify(serializable, null, 2), 'utf8');
  } catch (err) {
    console.warn('[scheduler] Failed to persist schedules:', err.message);
  }
}

function loadFromDisk() {
  if (!fs.existsSync(PERSIST_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(PERSIST_FILE, 'utf8'));
  } catch {
    return [];
  }
}

// ── next-run calculation ──────────────────────────────────────────────────────

function getNextRunAt(task) {
  try {
    const next = task.nextDate ? task.nextDate() : null;
    return next ? next.toISOString() : null;
  } catch {
    return null;
  }
}

// ── Core API ──────────────────────────────────────────────────────────────────

function createSchedule(id, cronExpr, scrapeOptions, onComplete, label) {
  if (!cron.validate(cronExpr)) {
    throw new Error(`Invalid cron expression: ${cronExpr}`);
  }

  const task = cron.schedule(cronExpr, async () => {
    try {
      const jobEntry = jobs.get(id);
      if (!jobEntry) return;
      jobEntry.lastRun = new Date().toISOString();
      jobEntry.status = 'running';

      const ScraperSession = require('./scraper');
      const sessionId = `sched-${id}-${Date.now()}`;
      const session = new ScraperSession(sessionId, () => {});
      const result = await session.run(scrapeOptions);

      jobEntry.status = 'idle';
      jobEntry.history.unshift({
        runAt: jobEntry.lastRun,
        success: true,
        resultSummary: {
          pages:   result.pages?.length || 0,
          graphql: result.apiCalls?.graphql?.length || 0,
          rest:    result.apiCalls?.rest?.length || 0,
        },
      });
      if (jobEntry.history.length > 20) jobEntry.history.length = 20;
      saveToDisk();

      if (onComplete) onComplete(result, null);
    } catch (err) {
      const jobEntry = jobs.get(id);
      if (jobEntry) {
        jobEntry.status = 'error';
        jobEntry.lastError = err.message;
        jobEntry.history.unshift({ runAt: jobEntry.lastRun, success: false, error: err.message });
        if (jobEntry.history.length > 20) jobEntry.history.length = 20;
        saveToDisk();
      }
      if (onComplete) onComplete(null, err);
    }
  }, { scheduled: false });

  jobs.set(id, {
    id,
    label:     label || null,
    task,
    cronExpr,
    scrapeOptions,
    createdAt: new Date().toISOString(),
    lastRun:   null,
    status:    'idle',
    lastError: null,
    history:   [],
  });

  task.start();
  saveToDisk();
  return id;
}

function deleteSchedule(id) {
  const job = jobs.get(id);
  if (!job) return false;
  job.task.stop();
  jobs.delete(id);
  saveToDisk();
  return true;
}

function listSchedules() {
  return [...jobs.values()].map((j) => ({
    id:            j.id,
    label:         j.label || null,
    cronExpr:      j.cronExpr,
    scrapeOptions: j.scrapeOptions,
    createdAt:     j.createdAt,
    lastRun:       j.lastRun,
    nextRunAt:     getNextRunAt(j.task),
    status:        j.status,
    lastError:     j.lastError,
    historyCount:  j.history.length,
    recentHistory: j.history.slice(0, 5),
  }));
}

// ── Restore on startup ────────────────────────────────────────────────────────

function restoreSchedules() {
  const saved = loadFromDisk();
  let restored = 0;
  for (const entry of saved) {
    if (!entry.id || !entry.cronExpr || !entry.scrapeOptions) continue;
    if (!cron.validate(entry.cronExpr)) continue;
    try {
      const task = cron.schedule(entry.cronExpr, async () => {
        try {
          const jobEntry = jobs.get(entry.id);
          if (!jobEntry) return;
          jobEntry.lastRun = new Date().toISOString();
          jobEntry.status = 'running';

          const ScraperSession = require('./scraper');
          const sessionId = `sched-${entry.id}-${Date.now()}`;
          const session = new ScraperSession(sessionId, () => {});
          const result = await session.run(entry.scrapeOptions);

          jobEntry.status = 'idle';
          jobEntry.history.unshift({
            runAt: jobEntry.lastRun, success: true,
            resultSummary: { pages: result.pages?.length || 0 },
          });
          if (jobEntry.history.length > 20) jobEntry.history.length = 20;
          saveToDisk();
        } catch (err) {
          const jobEntry = jobs.get(entry.id);
          if (jobEntry) {
            jobEntry.status = 'error';
            jobEntry.lastError = err.message;
            jobEntry.history.unshift({ runAt: jobEntry.lastRun, success: false, error: err.message });
            if (jobEntry.history.length > 20) jobEntry.history.length = 20;
            saveToDisk();
          }
        }
      }, { scheduled: false });

      jobs.set(entry.id, {
        id:            entry.id,
        label:         entry.label || null,
        task,
        cronExpr:      entry.cronExpr,
        scrapeOptions: entry.scrapeOptions,
        createdAt:     entry.createdAt || new Date().toISOString(),
        lastRun:       entry.lastRun || null,
        status:        'idle',
        lastError:     entry.lastError || null,
        history:       entry.history || [],
      });
      task.start();
      restored++;
    } catch {}
  }
  if (restored > 0) console.log(`[scheduler] Restored ${restored} schedule(s) from disk.`);
}

// Run restore immediately when module loads
restoreSchedules();

module.exports = { createSchedule, deleteSchedule, listSchedules, jobs };
