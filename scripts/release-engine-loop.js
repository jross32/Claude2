#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.join(REPO_ROOT, 'artifacts', 'release-engine', 'state.json');

function readStateCompleted() {
  if (!fs.existsSync(STATE_FILE)) return 0;
  try {
    const json = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return Number(json.releasesCompleted || 0);
  } catch (_err) {
    return 0;
  }
}

function parseArgs(argv) {
  const flags = new Set(argv);
  const readValue = (name, fallback) => {
    const idx = argv.indexOf(name);
    if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
    return fallback;
  };

  return {
    targetTotal: Number(readValue('--target-total', process.env.RELEASE_TARGET_TOTAL || '10000')),
    chunkSize: Number(readValue('--chunk-size', process.env.RELEASE_CHUNK_SIZE || '5')),
    verifyCommand: String(readValue('--verify', process.env.RELEASE_VERIFY_COMMAND || 'node tests/run.js smoke')),
    verifyTimeoutMs: Number(readValue('--verify-timeout-ms', process.env.RELEASE_VERIFY_TIMEOUT_MS || '180000')),
    reviewDelayMs: Number(readValue('--review-delay-ms', process.env.RELEASE_REVIEW_DELAY_MS || '3000')),
    heartbeatMs: Number(readValue('--heartbeat-ms', process.env.RELEASE_HEARTBEAT_MS || '15000')),
    allowDirty: flags.has('--allow-dirty') || process.env.RELEASE_ALLOW_DIRTY === '1',
    dryRun: flags.has('--dry-run') || process.env.RELEASE_DRY_RUN === '1',
    pushEach: flags.has('--push-each') || process.env.RELEASE_PUSH_EACH === '1',
    continueOnFailure: flags.has('--continue-on-failure'),
  };
}

function buildEngineArgs(cfg, iterations) {
  const args = [
    path.join('scripts', 'release-engine.js'),
    '--iterations',
    String(iterations),
    '--target-total',
    String(cfg.targetTotal),
    '--verify',
    cfg.verifyCommand,
    '--verify-timeout-ms',
    String(cfg.verifyTimeoutMs),
    '--review-delay-ms',
    String(cfg.reviewDelayMs),
    '--heartbeat-ms',
    String(cfg.heartbeatMs),
  ];

  if (cfg.allowDirty) args.push('--allow-dirty');
  if (cfg.dryRun) args.push('--dry-run');
  if (cfg.pushEach) args.push('--push-each');
  if (cfg.continueOnFailure) args.push('--continue-on-failure');

  return args;
}

function runChunk(cfg, iterations) {
  const args = buildEngineArgs(cfg, iterations);
  const start = Date.now();
  const result = spawnSync('node', args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: false,
  });
  return {
    code: Number(result.status || 0),
    durationMs: Date.now() - start,
  };
}

function main() {
  const cfg = parseArgs(process.argv.slice(2));

  if (!Number.isFinite(cfg.targetTotal) || cfg.targetTotal < 1) {
    throw new Error('target-total must be >= 1');
  }
  if (!Number.isFinite(cfg.chunkSize) || cfg.chunkSize < 1) {
    throw new Error('chunk-size must be >= 1');
  }

  let loops = 0;
  while (true) {
    const completed = readStateCompleted();
    if (completed >= cfg.targetTotal) {
      console.log(`release-engine-loop complete: ${completed}/${cfg.targetTotal}`);
      break;
    }

    const remaining = cfg.targetTotal - completed;
    const iterations = Math.min(cfg.chunkSize, remaining);
    loops += 1;

    console.log(`[loop ${loops}] completed=${completed}, remaining=${remaining}, running chunk=${iterations}`);
    const chunk = runChunk(cfg, iterations);
    console.log(`[loop ${loops}] chunk-exit=${chunk.code}, durationMs=${chunk.durationMs}`);

    if (chunk.code !== 0 && !cfg.continueOnFailure) {
      process.exit(chunk.code);
    }
  }
}

try {
  main();
} catch (err) {
  console.error('release-engine-loop failed:', err.message || err);
  process.exit(1);
}
