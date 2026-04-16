/**
 * unit/scraper-save.test.js
 * Verifies autosaved scrape artifacts retain the non-page signals that MCP analysis tools depend on.
 */

const fs = require('fs');
const path = require('path');
const { TestRunner } = require('../runner');
const ScraperSession = require('../../src/scraper');

const SAVES_DIR = path.join(__dirname, '../../scrape-saves');

async function main() {
  const runner = new TestRunner('unit');

  await runner.run('autosave persists console logs, websocket data, errors, and downloaded images', ({ setOutput }) => {
    const sessionId = `autosave-test-${Date.now()}`;
    const file = path.join(SAVES_DIR, `${sessionId}.json`);
    const session = new ScraperSession(sessionId, () => {});

    session._saveId = sessionId;
    session._saveStartUrl = 'https://example.com/store';
    session._saveStartedAt = '2026-04-16T00:00:00.000Z';
    session._saveOptions = { url: 'https://example.com/store' };
    session._saveVisited = new Set(['https://example.com/store']);
    session._savePages = [{
      meta: { url: 'https://example.com/store', title: 'Example Store' },
      fullText: 'Example store page',
      localStorage: { preferredStoreData: '{"storeNumber":"4337"}' },
      sessionStorage: {},
    }];
    session.consoleLogs = [{ type: 'error', text: 'Widget failed to render' }];
    session.errors = [{ message: 'Network failed', url: 'https://example.com/api' }];
    session.websockets = [{ url: 'wss://example.com/socket', frames: [{ direction: 'out', payload: 'ping' }] }];
    session.downloadedImages = [{ src: 'https://example.com/a.jpg', alt: 'promo', size: 1234 }];
    session.securityHeaders = { 'x-frame-options': 'DENY' };

    session._writeAutosave('complete');

    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(saved.consoleLogs) || saved.consoleLogs.length !== 1) throw new Error('consoleLogs were not saved');
    if (!Array.isArray(saved.errors) || saved.errors.length !== 1) throw new Error('errors were not saved');
    if (!Array.isArray(saved.websockets) || saved.websockets.length !== 1) throw new Error('websockets were not saved');
    if (!Array.isArray(saved.downloadedImages) || saved.downloadedImages.length !== 1) throw new Error('downloadedImages were not saved');

    fs.unlinkSync(file);
    setOutput({
      consoleLogs: saved.consoleLogs.length,
      errors: saved.errors.length,
      websockets: saved.websockets.length,
      downloadedImages: saved.downloadedImages.length,
    });
  });

  await runner.run('autosave persists headless visibility metadata for MCP saves', ({ setOutput }) => {
    const sessionId = `autosave-visibility-${Date.now()}`;
    const file = path.join(SAVES_DIR, `${sessionId}.json`);
    const session = new ScraperSession(sessionId, () => {});

    session._saveId = sessionId;
    session._saveStartUrl = 'https://example.com/headless';
    session._saveStartedAt = '2026-04-16T00:00:00.000Z';
    session._saveOptions = { url: 'https://example.com/headless' };
    session._saveUiVisible = false;
    session._saveInitiatedBy = 'mcp';

    session._writeAutosave('running');

    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (saved.uiVisible !== false) throw new Error('Expected uiVisible=false to be saved');
    if (saved.initiatedBy !== 'mcp') throw new Error(`Expected initiatedBy=mcp, got ${saved.initiatedBy}`);

    fs.unlinkSync(file);
    setOutput({ uiVisible: saved.uiVisible, initiatedBy: saved.initiatedBy });
  });

  const result = runner.finish();
  process.exit(result.summary.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test runner crashed:', err.message);
  process.exit(1);
});
