#!/usr/bin/env node
/**
 * secret-scan.js
 * Scans git-staged files for hardcoded credentials before any commit.
 * Run automatically via Claude Code hook, or manually: node scripts/secret-scan.js
 */

const { execSync } = require('child_process');

const PATTERNS = [
  { label: 'password assignment', re: /\b(password|passwd)\s*[:=]\s*['"`][^'"`]{3,}/i },
  { label: 'api_key assignment',  re: /\b(api_key|apikey|api-key)\s*[:=]\s*['"`][^'"`]{8,}/i },
  { label: 'secret assignment',   re: /\bsecret\s*[:=]\s*['"`][^'"`]{6,}/i },
  { label: 'token assignment',    re: /\btoken\s*[:=]\s*['"`][^'"`]{8,}/i },
  { label: 'bearer token',        re: /bearer\s+[a-zA-Z0-9\-._~+/]{20,}/i },
  { label: 'long hardcoded str',  re: /[:=]\s*['"`][a-zA-Z0-9+/=_\-]{40,}['"`]/ },
  { label: '.env inline value',   re: /^[+][A-Z_]{3,}=[^\s]{6,}$/ },
];

// Files to never flag (generated, docs, known-safe)
const IGNORE_PATTERNS = [
  /package-lock\.json$/,
  /\.min\.js$/,
  /CLAUDE\.md$/,
  /\.md$/,
  /tests\/fixtures\//,
  /references\//,
];

function shouldIgnore(filePath) {
  return IGNORE_PATTERNS.some(re => re.test(filePath));
}

let stagedFiles;
try {
  const out = execSync('git diff --cached --name-only', { encoding: 'utf8' });
  stagedFiles = out.trim().split('\n').filter(Boolean);
} catch {
  // Not a git repo or nothing staged — skip silently
  process.exit(0);
}

if (stagedFiles.length === 0) process.exit(0);

let findings = [];

for (const file of stagedFiles) {
  if (shouldIgnore(file)) continue;

  let diff;
  try {
    diff = execSync(`git diff --cached -- "${file}"`, { encoding: 'utf8' });
  } catch { continue; }

  const addedLines = diff
    .split('\n')
    .filter(l => l.startsWith('+') && !l.startsWith('+++'));

  addedLines.forEach((line, idx) => {
    for (const { label, re } of PATTERNS) {
      if (re.test(line)) {
        findings.push({ file, line: line.slice(0, 120), label });
        break;
      }
    }
  });
}

if (findings.length === 0) {
  console.log('[secret-scan] Clean — no credential patterns detected.');
  process.exit(0);
}

console.error('\n⚠️  SECRET SCAN — Potential credentials in staged changes:\n');
findings.forEach(({ file, line, label }) => {
  console.error(`  [${label}] ${file}`);
  console.error(`    ${line.trim()}\n`);
});
console.error('Remove hardcoded credentials and use .env instead before committing.\n');
process.exit(1);
