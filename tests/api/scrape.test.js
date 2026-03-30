/**
 * api/scrape.test.js
 * Contract tests for /api/scrape and session management endpoints.
 * Tests validation and session lifecycle only — does NOT run full scrapes.
 */

const { TestRunner } = require('../runner');
const { start, stop, get, post, json } = require('./_server');

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
