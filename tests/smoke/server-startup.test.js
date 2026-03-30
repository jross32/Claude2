/**
 * smoke/server-startup.test.js
 * Verifies the Express server starts, serves the frontend, and key endpoints respond correctly.
 */

const { TestRunner } = require('../runner');
const http   = require('http');
const { spawn } = require('child_process');
const path   = require('path');

const ROOT = path.join(__dirname, '../..');
const PORT = 3001; // Use 3001 so we don't clash with a running dev server

// ── Helpers ──────────────────────────────────────────────────────────────────

function httpGet(urlPath, port = PORT) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${port}${urlPath}`, { timeout: 6000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('request timed out')); });
  });
}

function httpPost(urlPath, body, port = PORT) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost', port, path: urlPath, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 6000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('request timed out')); });
    req.write(payload);
    req.end();
  });
}

function waitForServer(port, timeout = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http.get(`http://localhost:${port}/api/saves`, { timeout: 1000 }, (res) => {
        res.resume();
        resolve();
      }).on('error', () => {
        if (Date.now() - start > timeout) return reject(new Error(`Server didn't start within ${timeout}ms`));
        setTimeout(attempt, 400);
      });
    };
    attempt();
  });
}

// ── Test suite ────────────────────────────────────────────────────────────────

async function main() {
  const runner = new TestRunner('smoke');
  let serverProcess = null;

  // ── Startup ────────────────────────────────────────────────────────────────

  await runner.run('Server starts without crashing', async ({ setOutput }) => {
    serverProcess = spawn('node', ['--max-old-space-size=4096', 'src/server.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT) },
      stdio: 'pipe',
    });

    let stderr = '';
    serverProcess.stderr.on('data', d => { stderr += d.toString(); });
    serverProcess.on('exit', (code) => {
      if (code !== null && code !== 0 && stderr) console.error('  Server stderr:', stderr.slice(0, 300));
    });

    await waitForServer(PORT);
    setOutput({ pid: serverProcess.pid, port: PORT });
  });

  // ── Core endpoints ─────────────────────────────────────────────────────────

  await runner.run('GET /api/saves → 200 + JSON array', async ({ setOutput }) => {
    const res = await httpGet('/api/saves');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (!Array.isArray(body)) throw new Error('Expected array response');
    setOutput({ status: res.status, count: body.length });
  });

  await runner.run('GET /api/schedules → 200 + JSON array', async ({ setOutput }) => {
    const res = await httpGet('/api/schedules');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (!Array.isArray(body)) throw new Error('Expected array response');
    setOutput({ status: res.status });
  });

  await runner.run('GET /api/session/check → 200 + { exists: boolean }', async ({ setOutput }) => {
    const res = await httpGet('/api/session/check?url=http://example.com');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (typeof body.exists !== 'boolean') throw new Error(`Missing "exists" boolean, got: ${JSON.stringify(body)}`);
    setOutput({ status: res.status, exists: body.exists });
  });

  await runner.run('GET /api/site-credentials → 200 + { found: boolean }', async ({ setOutput }) => {
    const res = await httpGet('/api/site-credentials?url=http://example.com');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (typeof body.found !== 'boolean') throw new Error(`Missing "found" boolean, got: ${JSON.stringify(body)}`);
    setOutput({ status: res.status, found: body.found });
  });

  await runner.run('GET / serves HTML frontend', async ({ setOutput }) => {
    const res = await httpGet('/');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (!res.body.toLowerCase().includes('<html')) throw new Error('Response does not contain HTML');
    setOutput({ status: res.status, hasHTML: true });
  });

  // ── Chaos tests ────────────────────────────────────────────────────────────

  await runner.run('[chaos] POST /api/scrape with no URL → 400', async ({ setOutput }) => {
    const res = await httpPost('/api/scrape', {});
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (!body.error) throw new Error('Expected error message in response');
    setOutput({ status: res.status, error: body.error });
  });

  await runner.run('[chaos] GET unknown endpoint → 404', async ({ setOutput }) => {
    const res = await httpGet('/api/this-endpoint-does-not-exist');
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
    setOutput({ status: res.status });
  });

  await runner.run('[chaos] GET /api/saves/:id with fake ID → 404', async ({ setOutput }) => {
    const res = await httpGet('/api/saves/fake-id-that-does-not-exist');
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
    setOutput({ status: res.status });
  });

  // ── Cleanup ────────────────────────────────────────────────────────────────

  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 600));
  }

  const result = runner.finish();
  process.exit(result.summary.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\nTest runner crashed:', err.message);
  process.exit(1);
});
