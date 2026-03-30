#!/usr/bin/env node
/**
 * autosave.js — run manually to commit & push all current changes.
 * Usage: node autosave.js
 *        node autosave.js "optional custom message"
 */

const { execFile } = require('child_process');
const path = require('path');

const REPO_ROOT = __dirname;

function git(...args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: REPO_ROOT }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr.trim() || err.message));
      resolve(stdout.trim());
    });
  });
}

async function run() {
  const customMsg = process.argv[2];
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const message = customMsg || `manual save: ${timestamp}`;

  console.log('Staging all changes...');
  await git('add', '-A');

  const status = await git('status', '--porcelain');
  if (!status) {
    console.log('Nothing to commit — working tree is clean.');
    return;
  }

  console.log('Changed files:');
  console.log(status);

  await git('commit', '-m', message);
  console.log(`Committed: "${message}"`);

  console.log('Pushing to remote...');
  await git('push');
  console.log('Done. All changes pushed.');
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
