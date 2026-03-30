#!/usr/bin/env node
/**
 * syntax-check.js
 * Checks JS syntax of a recently edited file using node --check.
 * Called automatically by Claude Code PostToolUse hook after Edit/Write on .js files.
 * Also runnable manually: node scripts/syntax-check.js <file>
 */

const { execSync } = require('child_process');
const path = require('path');

// Accept file path from: CLI arg → CLAUDE_TOOL_INPUT env var
let filePath = process.argv[2];

if (!filePath) {
  try {
    const input = JSON.parse(process.env.CLAUDE_TOOL_INPUT || '{}');
    filePath = input.file_path || input.path || null;
  } catch {}
}

if (!filePath) process.exit(0);
if (!filePath.endsWith('.js')) process.exit(0);

// Normalize path separators
filePath = filePath.replace(/\\/g, '/');

try {
  execSync(`node --check "${filePath}"`, { stdio: 'pipe' });
  // Silent on success — no noise in normal workflow
} catch (err) {
  const msg = (err.stderr?.toString() || err.stdout?.toString() || err.message).trim();
  const name = path.basename(filePath);
  console.error(`\n⚠️  SYNTAX ERROR in ${name}:\n${msg}\n`);
  process.exit(1);
}
