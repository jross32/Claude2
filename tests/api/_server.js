/**
 * tests/api/_server.js
 * Shared server lifecycle + HTTP helpers for all api/ tests.
 * Each test file calls start() at the top and stop() at the end.
 */

const http   = require('http');
const net = require('net');
const { spawn } = require('child_process');
const path   = require('path');

const ROOT = path.join(__dirname, '../..');
let PORT = null;

let serverProcess = null;

function getPort() {
  if (!PORT) throw new Error('API test server has not been started yet');
  return PORT;
}

async function findOpenPort(startPort = 3311, attempts = 40) {
  for (let offset = 0; offset < attempts; offset++) {
    const candidate = startPort + offset;
    const available = await new Promise((resolve) => {
      const tester = net.createServer()
        .once('error', () => resolve(false))
        .once('listening', () => tester.close(() => resolve(true)))
        .listen(candidate, '127.0.0.1');
    });
    if (available) return candidate;
  }
  throw new Error(`Could not find an open port starting at ${startPort}`);
}

function waitForServer(port, timeout = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http.get(`http://localhost:${port}/api/saves`, { timeout: 1000 }, (res) => {
        res.resume(); resolve();
      }).on('error', () => {
        if (Date.now() - start > timeout) return reject(new Error(`Server didn't start within ${timeout}ms`));
        setTimeout(attempt, 400);
      });
    };
    attempt();
  });
}

async function start() {
  PORT = await findOpenPort(Number(process.env.TEST_SERVER_PORT || 3311));
  serverProcess = spawn('node', ['--max-old-space-size=4096', 'src/server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test', DISABLE_GIT_AUTOSAVE: '1' },
    stdio: 'pipe',
  });
  serverProcess.stderr.on('data', () => {}); // suppress noise
  await waitForServer(PORT);
}

function stop() {
  if (serverProcess) { serverProcess.kill('SIGTERM'); serverProcess = null; }
}

function get(urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${getPort()}${urlPath}`, { timeout: 6000 }, (res) => {
      let data = ''; res.on('data', c => data += c); res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function post(urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost', port: getPort(), path: urlPath, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 6000,
    }, (res) => {
      let data = ''; res.on('data', c => data += c); res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(payload); req.end();
  });
}

function del(urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost', port: getPort(), path: urlPath, method: 'DELETE', timeout: 6000,
    }, (res) => {
      let data = ''; res.on('data', c => data += c); res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function json(res) { return JSON.parse(res.body); }

module.exports = { start, stop, get, post, del, json, getPort };
