/**
 * api/schedules.test.js
 * Contract tests for /api/schedules endpoints.
 */

const { TestRunner } = require('../runner');
const { start, stop, get, post, del, json } = require('./_server');

async function main() {
  const runner = new TestRunner('api');
  await start();

  let createdId = null;

  // ── GET /api/schedules ─────────────────────────────────────────────────────

  await runner.run('GET /api/schedules → 200 + array', async ({ setOutput }) => {
    const res = await get('/api/schedules');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = json(res);
    if (!Array.isArray(body)) throw new Error('Response must be an array');
    setOutput({ status: res.status, count: body.length });
  });

  // ── POST /api/schedules ────────────────────────────────────────────────────

  await runner.run('POST /api/schedules with valid data → 200 + { id, message }', async ({ setOutput }) => {
    const res = await post('/api/schedules', {
      cronExpr: '0 * * * *',
      scrapeOptions: { url: 'http://example.com', maxPages: 1 },
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = json(res);
    if (typeof body.id !== 'string' || !body.id) throw new Error('Missing id string');
    if (typeof body.message !== 'string') throw new Error('Missing message string');
    createdId = body.id;
    setOutput({ status: res.status, id: body.id });
  });

  await runner.run('GET /api/schedules after create → contains new schedule', async ({ setOutput }) => {
    if (!createdId) throw new Error('No schedule was created in previous test');
    const res = await get('/api/schedules');
    const body = json(res);
    const found = body.some(s => s.id === createdId);
    if (!found) throw new Error(`Created schedule ${createdId} not found in list`);
    setOutput({ found: true, total: body.length });
  });

  // ── DELETE /api/schedules/:id ──────────────────────────────────────────────

  await runner.run('DELETE /api/schedules/:id for existing → 200 + message', async ({ setOutput }) => {
    if (!createdId) throw new Error('No schedule was created to delete');
    const res = await del(`/api/schedules/${createdId}`);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = json(res);
    if (!body.message) throw new Error('Expected message field');
    setOutput({ status: res.status });
  });

  await runner.run('GET /api/schedules after delete → schedule is gone', async ({ setOutput }) => {
    if (!createdId) throw new Error('No schedule was created');
    const res = await get('/api/schedules');
    const body = json(res);
    const found = body.some(s => s.id === createdId);
    if (found) throw new Error(`Deleted schedule ${createdId} still present in list`);
    setOutput({ found: false });
  });

  await runner.run('DELETE /api/schedules/:id for unknown → 404', async ({ setOutput }) => {
    const res = await del('/api/schedules/fake-schedule-id-999');
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
    setOutput({ status: res.status });
  });

  // ── Chaos ──────────────────────────────────────────────────────────────────

  await runner.run('[chaos] POST /api/schedules with no cronExpr → 400', async ({ setOutput }) => {
    const res = await post('/api/schedules', { scrapeOptions: { url: 'http://example.com' } });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    setOutput({ status: res.status });
  });

  await runner.run('[chaos] POST /api/schedules with no scrapeOptions → 400', async ({ setOutput }) => {
    const res = await post('/api/schedules', { cronExpr: '* * * * *' });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    setOutput({ status: res.status });
  });

  await runner.run('[chaos] POST /api/schedules with invalid cron → 400', async ({ setOutput }) => {
    const res = await post('/api/schedules', {
      cronExpr: 'not-a-valid-cron',
      scrapeOptions: { url: 'http://example.com' },
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    setOutput({ status: res.status });
  });

  stop();
  const result = runner.finish();
  process.exit(result.summary.failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('Test runner crashed:', err.message); process.exit(1); });
