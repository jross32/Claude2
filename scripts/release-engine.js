#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const PACKAGE_JSON = path.join(REPO_ROOT, 'package.json');
const ARTIFACT_ROOT = path.join(REPO_ROOT, 'artifacts', 'release-engine');
const RELEASE_DIR = path.join(ARTIFACT_ROOT, 'releases');
const STATE_FILE = path.join(ARTIFACT_ROOT, 'state.json');

const DEFAULT_IGNORE_STATUS_PATTERNS = [
  '^\\?\\?\\s+tests/logs/raw/',
];

function ensureDirs() {
  fs.mkdirSync(RELEASE_DIR, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function run(cmd, opts = {}) {
  return execSync(cmd, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: opts.capture ? ['ignore', 'pipe', 'pipe'] : 'pipe',
    timeout: opts.timeoutMs || 0,
  }).toString();
}

function runGit(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: opts.capture ? ['ignore', 'pipe', 'pipe'] : 'pipe',
    timeout: opts.timeoutMs || 0,
  }).toString();
}

function parseSemver(version) {
  const m = String(version || '').trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) {
    throw new Error(`Unsupported version format: ${version}. Expected x.y.z`);
  }
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
  };
}

function formatSemver(v) {
  return `${v.major}.${v.minor}.${v.patch}`;
}

function bumpPatch(version) {
  const parsed = parseSemver(version);
  parsed.patch += 1;
  return formatSemver(parsed);
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) {
    const pkg = readJson(PACKAGE_JSON);
    return {
      initializedAt: new Date().toISOString(),
      lastRunAt: null,
      releasesCompleted: 0,
      currentVersion: pkg.version,
      lastRelease: null,
      nextPlan: [
        'Run baseline health gate',
        'Select scoped change set',
        'Execute validations',
        'Prepare release artifact + commit',
      ],
    };
  }
  return readJson(STATE_FILE);
}

function saveState(state) {
  state.lastRunAt = new Date().toISOString();
  writeJson(STATE_FILE, state);
}

function getGitStatusShort() {
  const output = run('git status --short', { capture: true }).trim();
  if (!output) return [];
  return output.split(/\r?\n/).filter(Boolean);
}

function compileIgnorePatterns(patterns) {
  return patterns
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .map((p) => new RegExp(p));
}

function filterStatusLines(statusLines, ignoreRegexes) {
  if (!ignoreRegexes.length) return statusLines;
  return statusLines.filter((line) => !ignoreRegexes.some((rx) => rx.test(line)));
}

function getChangedSummary() {
  const output = run('git diff --name-only', { capture: true }).trim();
  if (!output) return [];
  return output.split(/\r?\n/).filter(Boolean);
}

function buildNextPlan(changedFiles, nextVersion) {
  const scoped = changedFiles.slice(0, 5);
  const plan = [];
  plan.push(`Define release scope for ${nextVersion} with <=5 high-impact files`);
  if (scoped.length) {
    plan.push(`Deep-verify touched files: ${scoped.join(', ')}`);
  } else {
    plan.push('Generate a focused change set before version bump');
  }
  plan.push('Run smoke tests and targeted checks before tagging release');
  plan.push('Capture lessons learned and pre-plan next version immediately');
  return plan;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runReleaseCycle(config, state, releaseIndex) {
  const packageJson = readJson(PACKAGE_JSON);
  const fromVersion = packageJson.version;
  const toVersion = bumpPatch(fromVersion);

  const releaseId = String(state.releasesCompleted + 1).padStart(5, '0');
  const startedAt = new Date().toISOString();

  const cycle = {
    releaseId,
    startedAt,
    fromVersion,
    toVersion,
    dryRun: config.dryRun,
    checks: [],
    nextPlan: [],
    completedAt: null,
    status: 'running',
    releaseIndex,
  };

  const statusSnapshot = getGitStatusShort();
  const actionableStatus = filterStatusLines(statusSnapshot, config.ignoreStatusRegexes);

  cycle.checks.push({
    name: 'git-status-snapshot',
    value: statusSnapshot,
    ok: true,
  });

  cycle.checks.push({
    name: 'git-status-actionable',
    value: actionableStatus,
    ok: true,
  });

  if (!config.allowDirty && actionableStatus.length > 0) {
    cycle.status = 'failed';
    cycle.completedAt = new Date().toISOString();
    cycle.checks.push({
      name: 'dirty-guard',
      ok: false,
      error: 'Working tree has actionable uncommitted changes; pass --allow-dirty to continue.',
    });
    writeJson(path.join(RELEASE_DIR, `release-${releaseId}.json`), cycle);
    return { ok: false, cycle };
  }

  if (config.verifyCommand) {
    const verifyStart = Date.now();
    try {
      run(config.verifyCommand, { timeoutMs: config.verifyTimeoutMs });
      cycle.checks.push({
        name: 'verify-command',
        command: config.verifyCommand,
        durationMs: Date.now() - verifyStart,
        ok: true,
      });
    } catch (err) {
      cycle.checks.push({
        name: 'verify-command',
        command: config.verifyCommand,
        durationMs: Date.now() - verifyStart,
        ok: false,
        error: String(err.message || err),
      });
      cycle.status = 'failed';
      cycle.completedAt = new Date().toISOString();
      writeJson(path.join(RELEASE_DIR, `release-${releaseId}.json`), cycle);
      return { ok: false, cycle };
    }
  }

  cycle.nextPlan = buildNextPlan(getChangedSummary(), toVersion);

  const holdMs = Math.max(0, config.reviewDelayMs);
  if (holdMs > 0) {
    await sleep(holdMs);
  }

  if (!config.dryRun) {
    packageJson.version = toVersion;
    writeJson(PACKAGE_JSON, packageJson);

    const commitSubject = `v${toVersion}: automated release cycle ${releaseId}`;
    const commitBody = [
      'Changed:',
      '- package.json: patch version bump for automated release cycle',
      `- artifacts/release-engine/releases/release-${releaseId}.json: release checkpoint artifact`,
      '',
      'Bugs fixed:',
      '- n/a (process release checkpoint)',
      '',
      `Version bump: ${fromVersion} -> ${toVersion}`,
    ].join('\n');

    runGit(['add', 'package.json']);
    runGit(['commit', '-m', commitSubject, '-m', commitBody]);
    if (config.pushEach) {
      runGit(['push']);
    }
  }

  cycle.completedAt = new Date().toISOString();
  cycle.status = 'ok';
  writeJson(path.join(RELEASE_DIR, `release-${releaseId}.json`), cycle);

  state.releasesCompleted += 1;
  state.currentVersion = toVersion;
  state.lastRelease = {
    releaseId,
    fromVersion,
    toVersion,
    completedAt: cycle.completedAt,
    status: cycle.status,
  };
  state.nextPlan = cycle.nextPlan;

  return { ok: true, cycle };
}

function parseArgs(argv) {
  const flags = new Set(argv);
  const readValue = (name, fallback) => {
    const idx = argv.indexOf(name);
    if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
    return fallback;
  };

  return {
    iterations: Number(readValue('--iterations', process.env.RELEASE_ITERATIONS || '1')),
    targetTotal: Number(readValue('--target-total', process.env.RELEASE_TARGET_TOTAL || '10000')),
    verifyCommand: readValue('--verify', process.env.RELEASE_VERIFY_COMMAND || 'node tests/run.js smoke'),
    verifyTimeoutMs: Number(readValue('--verify-timeout-ms', process.env.RELEASE_VERIFY_TIMEOUT_MS || '180000')),
    reviewDelayMs: Number(readValue('--review-delay-ms', process.env.RELEASE_REVIEW_DELAY_MS || '3000')),
    dryRun: flags.has('--dry-run') || process.env.RELEASE_DRY_RUN === '1',
    stopOnFailure: !flags.has('--continue-on-failure'),
    heartbeatMs: Number(readValue('--heartbeat-ms', process.env.RELEASE_HEARTBEAT_MS || '15000')),
    allowDirty: flags.has('--allow-dirty') || process.env.RELEASE_ALLOW_DIRTY === '1',
    pushEach: flags.has('--push-each') || process.env.RELEASE_PUSH_EACH === '1',
    ignoreStatusPatterns: String(readValue('--ignore-status', process.env.RELEASE_IGNORE_STATUS || '') || '')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

async function main() {
  ensureDirs();
  const cfg = parseArgs(process.argv.slice(2));
  const state = loadState();

  if (!Number.isFinite(cfg.iterations) || cfg.iterations < 1) {
    throw new Error('iterations must be >= 1');
  }

  if (!Number.isFinite(cfg.targetTotal) || cfg.targetTotal < 1) {
    throw new Error('target-total must be >= 1');
  }

  if (!Number.isFinite(cfg.heartbeatMs) || cfg.heartbeatMs < 1000) {
    throw new Error('heartbeat-ms must be >= 1000');
  }

  const combinedIgnorePatterns = DEFAULT_IGNORE_STATUS_PATTERNS.concat(cfg.ignoreStatusPatterns);
  cfg.ignoreStatusRegexes = compileIgnorePatterns(combinedIgnorePatterns);

  const remaining = Math.max(0, cfg.targetTotal - state.releasesCompleted);
  const maxRuns = Math.min(cfg.iterations, remaining);

  if (maxRuns === 0) {
    console.log(`Target already reached (${state.releasesCompleted}/${cfg.targetTotal}).`);
    return;
  }

  console.log(`Starting release-engine: runs=${maxRuns}, completed=${state.releasesCompleted}, target=${cfg.targetTotal}, dryRun=${cfg.dryRun}, allowDirty=${cfg.allowDirty}, pushEach=${cfg.pushEach}`);

  const heartbeat = setInterval(() => {
    console.log(`[heartbeat] completed=${state.releasesCompleted}, currentVersion=${state.currentVersion}`);
  }, cfg.heartbeatMs);

  try {
    for (let i = 0; i < maxRuns; i += 1) {
      const r = await runReleaseCycle(cfg, state, i + 1);
      saveState(state);

      const msg = `[${i + 1}/${maxRuns}] release=${r.cycle.releaseId} ${r.cycle.fromVersion} -> ${r.cycle.toVersion} status=${r.cycle.status}`;
      console.log(msg);

      if (!r.ok && cfg.stopOnFailure) {
        throw new Error(`Release cycle ${r.cycle.releaseId} failed; stopping.`);
      }
    }
  } finally {
    clearInterval(heartbeat);
  }

  console.log(`Release-engine complete. totalCompleted=${state.releasesCompleted}, currentVersion=${state.currentVersion}`);
  console.log('Next plan:');
  for (const step of state.nextPlan || []) {
    console.log(`- ${step}`);
  }
}

main().catch((err) => {
  console.error('release-engine failed:', err.message || err);
  process.exit(1);
});
