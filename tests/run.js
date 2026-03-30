#!/usr/bin/env node
/**
 * tests/run.js — CLI entry point for the test suite runner.
 *
 * Usage:
 *   node tests/run.js smoke              # run one suite
 *   node tests/run.js smoke browser      # run multiple suites
 *   node tests/run.js all                # run every suite that has test files
 */

const { execSync } = require('child_process');
const path = require('path');
const fs   = require('fs');

const TESTS_DIR = __dirname;
const SUITES = [
  'smoke', 'unit', 'integration', 'evaluations',
  'regression', 'performance', 'stress', 'security',
  'compatibility', 'api', 'snapshots', 'schema',
];

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`Usage: node tests/run.js <suite> [suite2 ...] | all`);
  console.log(`Suites: ${SUITES.join(', ')}`);
  process.exit(0);
}

const targets = args[0] === 'all'
  ? SUITES
  : args;

// Validate
for (const s of targets) {
  if (!SUITES.includes(s)) {
    console.error(`Unknown suite: "${s}". Valid: ${SUITES.join(', ')}`);
    process.exit(1);
  }
}

let totalFailed = 0;

for (const suite of targets) {
  const dir = path.join(TESTS_DIR, suite);
  if (!fs.existsSync(dir)) {
    console.log(`\n⏭️  Skipping ${suite}/ — folder not found`);
    continue;
  }

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.test.js'))
    .sort();

  if (files.length === 0) {
    console.log(`\n⏭️  Skipping ${suite}/ — no test files yet`);
    continue;
  }

  for (const file of files) {
    try {
      execSync(`node "${path.join(dir, file)}"`, {
        stdio: 'inherit',
        cwd:   path.join(TESTS_DIR, '..'),
        env:   process.env,
      });
    } catch {
      totalFailed++;
    }
  }
}

process.exit(totalFailed > 0 ? 1 : 0);
