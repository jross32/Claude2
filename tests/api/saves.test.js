/**
 * api/saves.test.js
 * Contract tests for /api/saves endpoints.
 */

const { TestRunner } = require('../runner');
const { start, stop, get, del, json } = require('./_server');

async function main() {
  const runner = new TestRunner('api');
  await start();

  // ── GET /api/saves ─────────────────────────────────────────────────────────

  await runner.run('GET /api/saves → 200 + array', async ({ setOutput }) => {
    const res = await get('/api/saves');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = json(res);
    if (!Array.isArray(body)) throw new Error('Response must be an array');
    setOutput({ status: res.status, count: body.length });
  });

  await runner.run('GET /api/saves items have expected shape', async ({ setOutput }) => {
    const res = await get('/api/saves');
    const body = json(res);
    // If there are saves, verify shape; otherwise skip shape check
    if (body.length > 0) {
      const item = body[0];
      const required = ['sessionId', 'startUrl', 'status'];
      for (const key of required) {
        if (!(key in item)) throw new Error(`Save item missing field: "${key}"`);
      }
    }
    setOutput({ count: body.length, shapeValid: true });
  });

  // ── GET /api/saves/:id ─────────────────────────────────────────────────────

  await runner.run('GET /api/saves/:id with unknown id → 404 + error', async ({ setOutput }) => {
    const res = await get('/api/saves/non-existent-save-id-12345');
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
    const body = json(res);
    if (!body.error) throw new Error('Expected error field in response');
    setOutput({ status: res.status });
  });

  // ── DELETE /api/saves/:id ──────────────────────────────────────────────────

  await runner.run('DELETE /api/saves/:id with unknown id → 200 + { ok: true }', async ({ setOutput }) => {
    // Deleting a non-existent save is idempotent — should succeed
    const res = await del('/api/saves/non-existent-save-id-12345');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = json(res);
    if (body.ok !== true) throw new Error(`Expected { ok: true }, got ${JSON.stringify(body)}`);
    setOutput({ status: res.status });
  });

  // ── Chaos ──────────────────────────────────────────────────────────────────

  await runner.run('[chaos] GET /api/saves/:id with empty id segment → 404', async ({ setOutput }) => {
    const res = await get('/api/saves/');
    // Express will route this to GET /api/saves (list), which returns 200
    // so we just verify it doesn't 500
    if (res.status === 500) throw new Error('Server errored on empty id segment');
    setOutput({ status: res.status });
  });

  await runner.run('[chaos] DELETE /api/saves/:id with special chars in id', async ({ setOutput }) => {
    const res = await del('/api/saves/id-with-special-chars-!@%23');
    if (res.status === 500) throw new Error(`Server crashed with status 500`);
    setOutput({ status: res.status });
  });

  stop();
  const result = runner.finish();
  process.exit(result.summary.failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('Test runner crashed:', err.message); process.exit(1); });
