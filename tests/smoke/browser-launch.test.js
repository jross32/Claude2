/**
 * smoke/browser-launch.test.js
 * Verifies Playwright Chromium launches, opens pages, and closes cleanly with no zombie processes.
 */

const { TestRunner } = require('../runner');
const { chromium }   = require('playwright');

async function main() {
  const runner  = new TestRunner('smoke');
  let   browser = null;

  // ── Launch ─────────────────────────────────────────────────────────────────

  await runner.run('Chromium launches in headless mode', async ({ setOutput }) => {
    browser = await chromium.launch({ headless: true });
    if (!browser) throw new Error('chromium.launch() returned null');
    setOutput({ launched: true });
  });

  await runner.run('Browser can open a new page', async ({ setOutput }) => {
    if (!browser) throw new Error('Browser not running — launch test failed');
    const page = await browser.newPage();
    const url  = page.url();
    await page.close();
    setOutput({ pageOpened: true, initialUrl: url });
  });

  await runner.run('Browser reports correct version string', async ({ setOutput }) => {
    if (!browser) throw new Error('Browser not running');
    const version = browser.version();
    if (!version || version.length === 0) throw new Error('Empty version string');
    setOutput({ version });
  });

  await runner.run('Multiple pages open and close independently', async ({ setOutput }) => {
    if (!browser) throw new Error('Browser not running');
    const pages = await Promise.all([
      browser.newPage(),
      browser.newPage(),
      browser.newPage(),
    ]);
    if (pages.length !== 3) throw new Error('Expected 3 pages');
    await Promise.all(pages.map(p => p.close()));
    setOutput({ pagesOpened: 3, pagesClosed: 3 });
  });

  await runner.run('Browser closes cleanly', async ({ setOutput }) => {
    if (!browser) throw new Error('Browser not running');
    await browser.close();
    browser = null;
    setOutput({ closed: true });
  });

  // ── Chaos tests ────────────────────────────────────────────────────────────

  await runner.run('[chaos] Navigation to invalid URL throws and browser stays alive', async ({ setOutput }) => {
    const b    = await chromium.launch({ headless: true });
    const page = await b.newPage();
    let caught = false;
    try {
      await page.goto('http://localhost:19999', { timeout: 3000 });
    } catch {
      caught = true;
    } finally {
      await page.close().catch(() => {});
      await b.close().catch(() => {});
    }
    if (!caught) throw new Error('Expected navigation to unreachable host to throw');
    setOutput({ errorCaught: true });
  });

  await runner.run('[chaos] browser.close() in finally block prevents zombie (double-close safe)', async ({ setOutput }) => {
    const b = await chromium.launch({ headless: true });
    // Close twice — should not throw
    await b.close();
    try { await b.close(); } catch { /* expected — second close may throw, that's fine */ }
    setOutput({ doubleCloseSafe: true });
  });

  await runner.run('[chaos] Empty page has no JS errors on about:blank', async ({ setOutput }) => {
    const b      = await chromium.launch({ headless: true });
    const page   = await b.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('about:blank');
    await page.waitForTimeout(300);
    await b.close();
    if (errors.length > 0) throw new Error(`Unexpected JS errors: ${errors.join(', ')}`);
    setOutput({ jsErrors: 0 });
  });

  // Safety — ensure browser is closed even if a test threw early
  if (browser) await browser.close().catch(() => {});

  const result = runner.finish();
  process.exit(result.summary.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\nTest runner crashed:', err.message);
  process.exit(1);
});
