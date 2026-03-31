/**
 * git-autosave.js
 * Automatically stages, commits, and pushes changes on a configurable interval.
 * Runs once on startup, then repeats every INTERVAL_MS milliseconds.
 * Errors are logged but never crash the app.
 *
 * Race-condition safe: uses a mutex flag so concurrent calls (e.g. server startup
 * + interval fire) skip rather than overlap. Also removes stale index.lock files
 * that are older than LOCK_STALE_MS before each run.
 */

const { execFile } = require('child_process');
const fs   = require('fs');
const path = require('path');

const REPO_ROOT      = path.join(__dirname, '..');
const INTERVAL_MS    = 10 * 60 * 1000; // 10 minutes
const LOCK_FILE      = path.join(REPO_ROOT, '.git', 'index.lock');
const LOCK_STALE_MS  = 30 * 1000; // consider lock stale after 30 s

// Mutex — prevents two autosave() calls running at the same time
let _running = false;

function git(...args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: REPO_ROOT, maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr.trim() || err.message));
      resolve(stdout.trim());
    });
  });
}

/** Remove .git/index.lock if it exists and is older than LOCK_STALE_MS. */
function clearStaleLock() {
  try {
    const stat = fs.statSync(LOCK_FILE);
    const age  = Date.now() - stat.mtimeMs;
    if (age > LOCK_STALE_MS) {
      fs.unlinkSync(LOCK_FILE);
      console.log(`[git-autosave] Removed stale index.lock (${Math.round(age / 1000)}s old).`);
    }
  } catch (_) {
    // ENOENT = no lock file — that's fine
  }
}

async function autosave() {
  if (_running) {
    console.log('[git-autosave] Skipped — previous run still in progress.');
    return;
  }
  _running = true;

  try {
    clearStaleLock();

    // Stage only project source files — never references/ or scrape-saves/
    const toStage = ['src/', 'public/', 'tests/', 'scripts/', '.claude/', 'CLAUDE.md', 'package.json', 'package-lock.json', 'autosave.js', '.gitignore'];
    await git('add', '--', ...toStage);

    // Check if there's anything to commit
    const status = await git('status', '--porcelain');
    if (!status) {
      console.log('[git-autosave] Nothing to commit, working tree clean.');
      return;
    }

    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    await git('commit', '-m', `auto-save: ${timestamp}`);
    console.log(`[git-autosave] Committed: auto-save: ${timestamp}`);

    await git('push');
    console.log('[git-autosave] Pushed to remote.');
  } catch (err) {
    console.error('[git-autosave] Error:', err.message);
  } finally {
    _running = false;
  }
}

function start() {
  console.log(`[git-autosave] Started — will auto-commit & push every ${INTERVAL_MS / 60000} minutes.`);

  // Run once immediately on startup
  autosave();

  // Then repeat on interval
  setInterval(autosave, INTERVAL_MS);
}

module.exports = { start, autosave };
