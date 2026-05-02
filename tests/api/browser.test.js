const fs = require('fs');
const http = require('http');
const path = require('path');
const { TestRunner } = require('../runner');
const { start, stop, get, post, del, json } = require('./_server');

const FIXTURE_HTML = fs.readFileSync(path.join(__dirname, '../fixtures/browser-automation.html'), 'utf8');

function startFixtureServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(FIXTURE_HTML);
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}/`,
      });
    });
    server.on('error', reject);
  });
}

async function main() {
  const runner = new TestRunner('api');
  let browserSessionId = null;
  let browserSaveId = null;
  let fixture = null;

  await start();
  fixture = await startFixtureServer();

  try {
    await runner.run('POST /api/browser/sessions opens a live browser automation session', async ({ setOutput }) => {
      const res = await post('/api/browser/sessions', {
        url: fixture.url,
        viewMode: 'console',
        persistenceMode: 'auth_state',
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = json(res);
      if (!body.browserSessionId) throw new Error('Expected browserSessionId');
      if (!body.snapshot?.interactables?.length) throw new Error('Expected initial interactables in snapshot');
      browserSessionId = body.browserSessionId;

      setOutput({
        browserSessionId,
        title: body.snapshot.title,
        interactables: body.snapshot.interactables.length,
      });
    });

    await runner.run('Browser session actions can type, click, wait, and refresh state', async ({ setOutput }) => {
      if (!browserSessionId) throw new Error('browserSessionId not set');

      const inspectRes = await post(`/api/browser/sessions/${encodeURIComponent(browserSessionId)}/inspect`, {});
      if (inspectRes.status !== 200) throw new Error(`Inspect failed with ${inspectRes.status}`);
      const inspectBody = json(inspectRes);
      const searchInput = inspectBody.interactables.find((element) =>
        element.preferredSelector === '#search-box' || /search/i.test(element.label || '')
      );
      if (!searchInput?.elementId) throw new Error('Expected a search input elementId');

      const typeRes = await post(`/api/browser/sessions/${encodeURIComponent(browserSessionId)}/type`, {
        elementId: searchInput.elementId,
        value: 'pricing',
      });
      if (typeRes.status !== 200) throw new Error(`Type failed with ${typeRes.status}`);

      const clickRes = await post(`/api/browser/sessions/${encodeURIComponent(browserSessionId)}/click`, {
        selector: '#search-btn',
      });
      if (clickRes.status !== 200) throw new Error(`Click failed with ${clickRes.status}`);

      const waitRes = await post(`/api/browser/sessions/${encodeURIComponent(browserSessionId)}/wait`, {
        textIncludes: 'Results for: pricing',
        timeoutMs: 8000,
      });
      if (waitRes.status !== 200) throw new Error(`Wait failed with ${waitRes.status}`);

      const stateRes = await get(`/api/browser/sessions/${encodeURIComponent(browserSessionId)}?refreshSnapshot=0`);
      if (stateRes.status !== 200) throw new Error(`State failed with ${stateRes.status}`);
      const state = json(stateRes);
      if (!/Results for: pricing/.test(state.snapshot?.visibleTextSummary || '')) {
        throw new Error('Expected updated search results text in the page snapshot');
      }

      setOutput({
        currentUrl: state.currentUrl,
        narration: state.lastNarration,
      });
    });

    await runner.run('Browser session save, screenshot, and scraper handoff work end-to-end', async ({ setOutput }) => {
      if (!browserSessionId) throw new Error('browserSessionId not set');

      const screenshotRes = await post(`/api/browser/sessions/${encodeURIComponent(browserSessionId)}/screenshot`, {
        fullPage: false,
      });
      if (screenshotRes.status !== 200) throw new Error(`Screenshot failed with ${screenshotRes.status}`);
      const screenshot = json(screenshotRes);
      if (!screenshot.screenshotBase64 || screenshot.screenshotBase64.length < 100) {
        throw new Error('Expected a non-trivial screenshot payload');
      }

      const saveRes = await post(`/api/browser/sessions/${encodeURIComponent(browserSessionId)}/save`, {
        name: 'Browser API Fixture Save',
      });
      if (saveRes.status !== 200) throw new Error(`Save failed with ${saveRes.status}`);
      const saveBody = json(saveRes);
      if (!saveBody.browserSaveId) throw new Error('Expected browserSaveId from save');
      browserSaveId = saveBody.browserSaveId;

      const savesRes = await get('/api/browser/saves');
      if (savesRes.status !== 200) throw new Error(`List saves failed with ${savesRes.status}`);
      const saves = json(savesRes);
      if (!saves.some((save) => save.browserSaveId === browserSaveId)) {
        throw new Error(`Expected saved browser state ${browserSaveId} to appear in the list`);
      }

      const scrapeRes = await post(`/api/browser/sessions/${encodeURIComponent(browserSessionId)}/scrape`, {
        maxPages: 1,
        captureGraphQL: false,
        captureREST: false,
      });
      if (scrapeRes.status !== 200) throw new Error(`Scrape handoff failed with ${scrapeRes.status}`);
      const scrapeBody = json(scrapeRes);
      if (!scrapeBody.scrapeSessionId) throw new Error('Expected scrapeSessionId from browser handoff');
      if (!Array.isArray(scrapeBody.result?.pages) || scrapeBody.result.pages.length < 1) {
        throw new Error('Expected scrape handoff result pages');
      }

      setOutput({
        browserSaveId,
        scrapeSessionId: scrapeBody.scrapeSessionId,
        pageCount: scrapeBody.result.pages.length,
      });
    });
  } finally {
    if (browserSessionId) {
      try { await del(`/api/browser/sessions/${encodeURIComponent(browserSessionId)}`); } catch {}
    }
    if (browserSaveId) {
      try { await del(`/api/browser/saves/${encodeURIComponent(browserSaveId)}`); } catch {}
    }
    try { fixture?.server?.close?.(); } catch {}
    stop();
  }

  const result = runner.finish();
  process.exit(result.summary.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  stop();
  console.error('Test runner crashed:', err.message);
  process.exit(1);
});
