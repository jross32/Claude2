/**
 * tests/runner.js
 * Shared TestRunner class used by all test suites.
 * Produces dual output: latest_ai.json (machine) + latest_human.md (human).
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LOGS_DIR = path.join(__dirname, 'logs');
const RAW_DIR  = path.join(LOGS_DIR, 'raw');

function ensureDirs() {
  [LOGS_DIR, RAW_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));
}

function getGitCommit() {
  try { return execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: 'pipe' }).trim(); }
  catch { return 'unknown'; }
}

class TestRunner {
  constructor(suiteName) {
    this.suiteName = suiteName;
    this.tests     = [];
    this.startTime = Date.now();
    console.log(`\n${'─'.repeat(55)}`);
    console.log(`  Suite: ${suiteName}`);
    console.log(`${'─'.repeat(55)}\n`);
  }

  // Run a test. fn receives { setInput, setOutput } helpers.
  async run(name, fn) {
    const start = Date.now();
    let status = 'pass', error = null, stack_trace = null;
    let input = {}, output = {}, screenshot = null;

    try {
      const result = await fn({
        setInput:      (v) => { input  = v; },
        setOutput:     (v) => { output = v; },
        setScreenshot: (v) => { screenshot = v; },
      });
      if (result !== undefined) output = result;
    } catch (err) {
      status      = 'fail';
      error       = err.message;
      stack_trace = err.stack;
    }

    const duration_ms = Date.now() - start;
    const emoji = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⏭️';
    console.log(`  ${emoji} ${name} (${duration_ms}ms)`);
    if (error) console.log(`     └─ ${error}`);

    this.tests.push({ name, status, duration_ms, error, input, output, stack_trace, screenshot });
  }

  // Mark a test as skipped without running it.
  skip(name, reason = '') {
    console.log(`  ⏭️  ${name}${reason ? ' — ' + reason : ''}`);
    this.tests.push({
      name, status: 'skip', duration_ms: 0,
      error: reason || null, input: {}, output: {}, stack_trace: null, screenshot: null,
    });
  }

  // Call after all tests are registered. Writes both output files and returns the result object.
  finish() {
    ensureDirs();

    const total      = this.tests.length;
    const passed     = this.tests.filter(t => t.status === 'pass').length;
    const failed     = this.tests.filter(t => t.status === 'fail').length;
    const skipped    = this.tests.filter(t => t.status === 'skip').length;
    const duration_ms = Date.now() - this.startTime;
    const gitCommit  = getGitCommit();

    // ── AI output (JSON) ──────────────────────────────────────────────────
    const result = {
      timestamp:  new Date().toISOString(),
      git_commit: gitCommit,
      suite:      this.suiteName,
      tests:      this.tests,
      summary:    {
        total, passed, failed, skipped,
        duration_ms,
        avg_duration_ms: total > 0 ? Math.round(duration_ms / total) : 0,
      },
    };

    fs.writeFileSync(path.join(LOGS_DIR, 'latest_ai.json'), JSON.stringify(result, null, 2));
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(RAW_DIR, `${this.suiteName}-${ts}.json`), JSON.stringify(result, null, 2));

    // ── Human output (Markdown) ───────────────────────────────────────────
    const verdict = failed === 0 ? '✅ HEALTHY' : '❌ FAILING';

    const tableRows = this.tests.map(t => {
      const e    = t.status === 'pass' ? '✅' : t.status === 'fail' ? '❌' : '⏭️';
      const shot = t.screenshot ? ` · [screenshot](${t.screenshot})` : '';
      return `| ${e} | ${t.name} | ${t.status} | ${t.duration_ms}ms |${shot} |`;
    }).join('\n');

    const errorBlocks = this.tests
      .filter(t => t.status === 'fail')
      .map(t => `### ❌ ${t.name}\n\`\`\`\n${t.error}\n${t.stack_trace || ''}\n\`\`\``)
      .join('\n\n');

    const nextSteps = failed > 0
      ? `## Suggested Next Steps\n\n- Run \`/new-test\` to dig into failing tests\n- Check \`tests/logs/raw/\` for full history`
      : '';

    const md = [
      `# Test Results — ${this.suiteName}`,
      '',
      `**Status:** ${verdict}`,
      `**Run:** ${result.timestamp}`,
      `**Commit:** \`${gitCommit}\``,
      `**Duration:** ${duration_ms}ms`,
      '',
      '## Summary',
      '',
      '| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |',
      '|-------|---------|---------|---------|',
      `| ${total} | ${passed} | ${failed} | ${skipped} |`,
      '',
      '## Results',
      '',
      '| | Test | Status | Duration | |',
      '|--|------|--------|----------|--|',
      tableRows,
      '',
      errorBlocks ? `## Errors\n\n${errorBlocks}` : '',
      nextSteps,
    ].filter(l => l !== undefined).join('\n');

    fs.writeFileSync(path.join(LOGS_DIR, 'latest_human.md'), md);

    // ── Console summary ───────────────────────────────────────────────────
    console.log(`\n${'─'.repeat(55)}`);
    console.log(`  ${verdict}  ${passed}/${total} passed · ${failed} failed · ${skipped} skipped · ${duration_ms}ms`);
    console.log(`  Logs → tests/logs/latest_ai.json + latest_human.md`);
    console.log(`${'─'.repeat(55)}\n`);

    return result;
  }
}

module.exports = { TestRunner };
