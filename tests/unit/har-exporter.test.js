/**
 * unit/har-exporter.test.js
 * Tests for src/har-exporter.js — exportHAR()
 */

const { TestRunner } = require('../runner');
const { exportHAR } = require('../../src/har-exporter');

const GRAPHQL_CALL = {
  url: 'https://api.example.com/graphql',
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: { query: 'query GetUser { user { id } }' },
  timestamp: '2024-01-01T00:00:00Z',
  response: { status: 200, body: { data: { user: { id: '1' } } } },
};

const REST_CALL = {
  url: 'https://api.example.com/users',
  method: 'GET',
  headers: { accept: 'application/json' },
  body: null,
  timestamp: '2024-01-01T00:01:00Z',
  response: { status: 200, body: [{ id: '1', name: 'Alice' }] },
};

const SCRAPE_RESULT = {
  apiCalls: {
    graphql: [GRAPHQL_CALL],
    rest: [REST_CALL],
  },
};

async function main() {
  const runner = new TestRunner('unit');

  // ── HAR envelope ──────────────────────────────────────────────────────────

  await runner.run('exportHAR returns object with log key', ({ setOutput }) => {
    const har = exportHAR(SCRAPE_RESULT);
    if (!har.log) throw new Error('Missing log key');
    setOutput({ keys: Object.keys(har) });
  });

  await runner.run('har.log has version "1.2"', ({ setOutput }) => {
    const har = exportHAR(SCRAPE_RESULT);
    if (har.log.version !== '1.2') throw new Error(`Expected "1.2", got ${har.log.version}`);
    setOutput({ version: har.log.version });
  });

  await runner.run('har.log has creator and browser fields', ({ setOutput }) => {
    const har = exportHAR(SCRAPE_RESULT);
    if (!har.log.creator?.name) throw new Error('Missing creator.name');
    if (!har.log.browser?.name) throw new Error('Missing browser.name');
    setOutput({ creator: har.log.creator.name, browser: har.log.browser.name });
  });

  await runner.run('har.log.entries is an array', ({ setOutput }) => {
    const har = exportHAR(SCRAPE_RESULT);
    if (!Array.isArray(har.log.entries)) throw new Error('Expected entries array');
    setOutput({ count: har.log.entries.length });
  });

  // ── Entry structure ───────────────────────────────────────────────────────

  await runner.run('entries contain one entry per graphql + rest call', ({ setOutput }) => {
    const har = exportHAR(SCRAPE_RESULT);
    if (har.log.entries.length !== 2) throw new Error(`Expected 2 entries, got ${har.log.entries.length}`);
    setOutput({ count: har.log.entries.length });
  });

  await runner.run('each entry has required HAR fields', ({ setOutput }) => {
    const har = exportHAR(SCRAPE_RESULT);
    const entry = har.log.entries[0];
    const required = ['startedDateTime', 'time', 'request', 'response', 'cache', 'timings'];
    for (const k of required) {
      if (!(k in entry)) throw new Error(`Entry missing field: ${k}`);
    }
    setOutput({ fields: required });
  });

  await runner.run('entry request has method and url', ({ setOutput }) => {
    const har = exportHAR(SCRAPE_RESULT);
    const entry = har.log.entries[0];
    if (!entry.request.method) throw new Error('Missing request.method');
    if (!entry.request.url) throw new Error('Missing request.url');
    setOutput({ method: entry.request.method, url: entry.request.url });
  });

  await runner.run('entry response has status', ({ setOutput }) => {
    const har = exportHAR(SCRAPE_RESULT);
    const entry = har.log.entries[0];
    if (typeof entry.response.status !== 'number') throw new Error('response.status must be number');
    setOutput({ status: entry.response.status });
  });

  await runner.run('entry has _type set to "graphql" or "rest"', ({ setOutput }) => {
    const har = exportHAR(SCRAPE_RESULT);
    const types = har.log.entries.map(e => e._type);
    if (!types.includes('graphql')) throw new Error('Missing graphql type');
    if (!types.includes('rest')) throw new Error('Missing rest type');
    setOutput({ types });
  });

  await runner.run('request headers are converted to name/value pairs', ({ setOutput }) => {
    const har = exportHAR(SCRAPE_RESULT);
    const headers = har.log.entries[0].request.headers;
    if (!Array.isArray(headers)) throw new Error('Expected headers array');
    if (headers.length > 0 && !('name' in headers[0])) throw new Error('Header missing name field');
    setOutput({ count: headers.length });
  });

  // ── No body edge case ─────────────────────────────────────────────────────

  await runner.run('entry with no request body → postData absent', ({ setOutput }) => {
    const har = exportHAR({ apiCalls: { graphql: [], rest: [REST_CALL] } });
    const entry = har.log.entries[0];
    // REST_CALL.body is null — no postData should be present
    if ('postData' in entry.request) throw new Error('postData should be absent when body is null');
    setOutput({ ok: true });
  });

  // ── Chaos ─────────────────────────────────────────────────────────────────

  await runner.run('[chaos] empty apiCalls → 0 entries', ({ setOutput }) => {
    const har = exportHAR({ apiCalls: { graphql: [], rest: [] } });
    if (har.log.entries.length !== 0) throw new Error('Expected 0 entries');
    setOutput({ ok: true });
  });

  await runner.run('[chaos] missing apiCalls key → 0 entries, no crash', ({ setOutput }) => {
    const har = exportHAR({ pages: [] });
    if (!Array.isArray(har.log.entries)) throw new Error('Expected entries array');
    setOutput({ ok: true });
  });

  await runner.run('[chaos] call with no url → entry still built', ({ setOutput }) => {
    const har = exportHAR({ apiCalls: { graphql: [{ method: 'POST', headers: {} }], rest: [] } });
    if (har.log.entries.length !== 1) throw new Error('Expected 1 entry');
    setOutput({ ok: true });
  });

  await runner.run('[chaos] call with no response → entry still built', ({ setOutput }) => {
    const har = exportHAR({ apiCalls: { graphql: [{ url: 'http://x.com', method: 'POST', headers: {} }], rest: [] } });
    if (har.log.entries.length !== 1) throw new Error('Expected 1 entry');
    setOutput({ ok: true });
  });

  const result = runner.finish();
  process.exit(result.summary.failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('Test runner crashed:', err.message); process.exit(1); });
