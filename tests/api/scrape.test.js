/**
 * api/scrape.test.js
 * Contract tests for /api/scrape and session management endpoints.
 * Tests validation and session lifecycle only — does NOT run full scrapes.
 */

const { TestRunner } = require('../runner');
const { start, stop, get, post, json } = require('./_server');

async function waitFor(predicate, timeoutMs = 12000, intervalMs = 250) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

async function main() {
  const runner = new TestRunner('api');
  await start();

  let liveSessionId = null;

  // ── POST /api/scrape validation ────────────────────────────────────────────

  await runner.run('POST /api/scrape with no body → 400 + error', async ({ setOutput }) => {
    const res = await post('/api/scrape', {});
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    const body = json(res);
    if (!body.error) throw new Error('Expected error field');
    setOutput({ status: res.status, error: body.error });
  });

  await runner.run('POST /api/scrape with valid url → 200 + { sessionId, message }', async ({ setOutput }) => {
    const res = await post('/api/scrape', { url: 'http://example.com', maxPages: 1 });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = json(res);
    if (typeof body.sessionId !== 'string' || !body.sessionId) throw new Error('Missing sessionId string');
    if (typeof body.message !== 'string') throw new Error('Missing message string');
    liveSessionId = body.sessionId;
    setOutput({ status: res.status, sessionId: body.sessionId });
  });

  await runner.run('GET /api/scrape/active returns active session snapshots', async ({ setOutput }) => {
    if (!liveSessionId) throw new Error('Expected live session from previous test');
    const res = await get('/api/scrape/active');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = json(res);
    if (!Array.isArray(body)) throw new Error('Expected an array response');
    const match = body.find((entry) => entry.sessionId === liveSessionId);
    if (!match) throw new Error(`Active session ${liveSessionId} not found`);
    if (!('state' in match) || !('partialPageCount' in match)) {
      throw new Error('Expected live snapshot fields');
    }
    setOutput({ count: body.length, state: match.state });
  });

  await runner.run('GET /api/scrape/:id/status returns live session snapshot', async ({ setOutput }) => {
    if (!liveSessionId) throw new Error('Expected live session from previous test');
    const res = await get(`/api/scrape/${liveSessionId}/status`);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = json(res);
    if (body.sessionId !== liveSessionId) throw new Error('Expected matching sessionId');
    if (!body.state || !body.startedAt || !body.updatedAt) throw new Error('Missing expected status fields');
    setOutput({ state: body.state, step: body.step });
  });

  // ── Session lifecycle endpoints ────────────────────────────────────────────

  await runner.run('POST /api/scrape/:id/stop for active session → 200', async ({ setOutput }) => {
    if (!liveSessionId) { setOutput({ skipped: 'no live session' }); return; }
    const res = await post(`/api/scrape/${liveSessionId}/stop`, {});
    // May be 200 (stopped) or 404 (already finished by the time we hit it)
    if (res.status !== 200 && res.status !== 404) {
      throw new Error(`Expected 200 or 404, got ${res.status}`);
    }
    setOutput({ status: res.status });
  });

  await runner.run('GET /api/scrape/:id/status falls back after active session is removed', async ({ setOutput }) => {
    if (!liveSessionId) throw new Error('Expected live session from previous test');

    await waitFor(async () => {
      const activeRes = await get('/api/scrape/active');
      if (activeRes.status !== 200) return false;
      const active = json(activeRes);
      return !active.some((entry) => entry.sessionId === liveSessionId);
    }, 12000, 300);

    const res = await waitFor(async () => {
      const statusRes = await get(`/api/scrape/${liveSessionId}/status`);
      if (statusRes.status !== 200) return false;
      const body = json(statusRes);
      return body.state === 'stopped' || body.state === 'complete' || body.state === 'error'
        ? { body, status: statusRes.status }
        : false;
    }, 12000, 300);

    if (res.body.sessionId !== liveSessionId) throw new Error('Expected saved session fallback payload');
    setOutput({ status: res.status, state: res.body.state });
  });

  await runner.run('POST /api/scrape/:id/stop for unknown session → 404', async ({ setOutput }) => {
    const res = await post('/api/scrape/fake-session-id-999/stop', {});
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
    const body = json(res);
    if (!body.error) throw new Error('Expected error field');
    setOutput({ status: res.status });
  });

  await runner.run('POST /api/scrape/:id/pause for unknown session → 404', async ({ setOutput }) => {
    const res = await post('/api/scrape/fake-session-id-999/pause', {});
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
    setOutput({ status: res.status });
  });

  await runner.run('GET /api/scrape/:id/status for unknown session → 404', async ({ setOutput }) => {
    const res = await get('/api/scrape/fake-session-id-999/status');
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
    setOutput({ status: res.status });
  });

  await runner.run('POST /api/ai/chat with no question → 400', async ({ setOutput }) => {
    const res = await post('/api/ai/chat', { source: 'current', scrapeData: { pages: [] } });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    const body = json(res);
    if (!body.error) throw new Error('Expected error field');
    setOutput({ status: res.status, error: body.error });
  });

  await runner.run('POST /api/ai/chat analyzes current scrape data without Ollama for extractive questions', async ({ setOutput }) => {
    const res = await post('/api/ai/chat', {
      source: 'current',
      question: 'What are the store hours?',
      mode: 'auto',
      scrapeData: {
        startUrl: 'https://example.com/store',
        meta: { targetUrl: 'https://example.com/store' },
        pages: [{
          meta: {
            url: 'https://example.com/store',
            title: 'Example Store',
            description: 'Store details',
          },
          fullText: 'Example Store is open every day from 8:00 AM to 9:00 PM.',
          headings: { h1: [{ text: 'Store hours' }], h2: [] },
          links: [],
        }],
        apiCalls: { graphql: [], rest: [] },
        visitedUrls: ['https://example.com/store'],
        failedPages: [],
      },
    });

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = json(res);
    if (body.source !== 'current') throw new Error(`Expected current source, got ${body.source}`);
    if (body.routeUsed !== 'extractive') throw new Error(`Expected extractive route, got ${body.routeUsed}`);
    if (!String(body.answer || '').includes('8:00 AM')) throw new Error(`Unexpected answer: ${body.answer}`);
    setOutput({ routeUsed: body.routeUsed, confidence: body.confidence });
  });

  await runner.run('POST /api/scrape/:id/resume for unknown session → 404', async ({ setOutput }) => {
    const res = await post('/api/scrape/fake-session-id-999/resume', {});
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
    setOutput({ status: res.status });
  });

  await runner.run('POST /api/scrape/:id/verify for unknown session → 404', async ({ setOutput }) => {
    const res = await post('/api/scrape/fake-session-id-999/verify', { code: '123456' });
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
    setOutput({ status: res.status });
  });

  await runner.run('POST /api/scrape/:id/credentials for unknown session → 404', async ({ setOutput }) => {
    const res = await post('/api/scrape/fake-session-id-999/credentials', { username: 'u', password: 'p' });
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
    setOutput({ status: res.status });
  });

  // ── Chaos ──────────────────────────────────────────────────────────────────

  await runner.run('[chaos] POST /api/scrape with urls: [] → 400', async ({ setOutput }) => {
    const res = await post('/api/scrape', { urls: [] });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    setOutput({ status: res.status });
  });

  await runner.run('[chaos] POST /api/scrape with malformed maxPages → does not 500', async ({ setOutput }) => {
    const res = await post('/api/scrape', { url: 'http://example.com', maxPages: 'not-a-number' });
    if (res.status === 500) throw new Error('Server crashed on malformed maxPages');
    setOutput({ status: res.status });
  });

  // Wait briefly to let any background scrape start/stop cleanly
  await new Promise(r => setTimeout(r, 1000));

  stop();
  const result = runner.finish();
  process.exit(result.summary.failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('Test runner crashed:', err.message); process.exit(1); });
