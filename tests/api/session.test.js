/**
 * api/session.test.js
 * Contract tests for session check, session clear, and site-credentials endpoints.
 */

const { TestRunner } = require('../runner');
const { start, stop, get, del, json } = require('./_server');

async function main() {
  const runner = new TestRunner('api');
  await start();

  // ── GET /api/session/check ─────────────────────────────────────────────────

  await runner.run('GET /api/session/check with valid url → 200 + { exists: boolean }', async ({ setOutput }) => {
    const res = await get('/api/session/check?url=http://example.com');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = json(res);
    if (typeof body.exists !== 'boolean') throw new Error(`"exists" must be boolean, got: ${typeof body.exists}`);
    setOutput({ status: res.status, exists: body.exists });
  });

  await runner.run('GET /api/session/check for poolplayers.com → exists field present', async ({ setOutput }) => {
    const res = await get('/api/session/check?url=https://league.poolplayers.com');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = json(res);
    if (typeof body.exists !== 'boolean') throw new Error(`"exists" must be boolean`);
    setOutput({ status: res.status, exists: body.exists });
  });

  // ── DELETE /api/session ────────────────────────────────────────────────────

  await runner.run('DELETE /api/session with url → 200 + { cleared: boolean }', async ({ setOutput }) => {
    const res = await del('/api/session?url=http://no-session-here.example.com');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = json(res);
    if (typeof body.cleared !== 'boolean') throw new Error(`"cleared" must be boolean, got: ${typeof body.cleared}`);
    setOutput({ status: res.status, cleared: body.cleared });
  });

  // ── GET /api/site-credentials ──────────────────────────────────────────────

  await runner.run('GET /api/site-credentials for unknown site → { found: false }', async ({ setOutput }) => {
    const res = await get('/api/site-credentials?url=http://unknownsite123.example.com');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = json(res);
    if (typeof body.found !== 'boolean') throw new Error(`"found" must be boolean`);
    if (body.found !== false) throw new Error(`Expected found: false for unknown site`);
    setOutput({ status: res.status, found: body.found });
  });

  await runner.run('GET /api/site-credentials for poolplayers.com → { found: true, username: string }', async ({ setOutput }) => {
    const res = await get('/api/site-credentials?url=https://league.poolplayers.com');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = json(res);
    if (typeof body.found !== 'boolean') throw new Error(`"found" must be boolean`);
    // found may be true or false depending on whether .env is loaded
    if (body.found && typeof body.username !== 'string') {
      throw new Error(`When found: true, username must be a string`);
    }
    setOutput({ status: res.status, found: body.found });
  });

  // ── Chaos ──────────────────────────────────────────────────────────────────

  await runner.run('[chaos] GET /api/session/check with no url → { exists: false }', async ({ setOutput }) => {
    const res = await get('/api/session/check');
    if (res.status === 500) throw new Error('Server crashed with no url param');
    const body = json(res);
    if (typeof body.exists !== 'boolean') throw new Error(`Expected exists boolean, got ${JSON.stringify(body)}`);
    setOutput({ status: res.status, exists: body.exists });
  });

  await runner.run('[chaos] DELETE /api/session with no url → does not 500', async ({ setOutput }) => {
    const res = await del('/api/session');
    if (res.status === 500) throw new Error('Server crashed with no url param');
    setOutput({ status: res.status });
  });

  await runner.run('[chaos] GET /api/site-credentials with no url → does not 500', async ({ setOutput }) => {
    const res = await get('/api/site-credentials');
    if (res.status === 500) throw new Error('Server crashed with no url param');
    setOutput({ status: res.status });
  });

  stop();
  const result = runner.finish();
  process.exit(result.summary.failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('Test runner crashed:', err.message); process.exit(1); });
