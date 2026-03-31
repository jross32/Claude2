/**
 * endpoint-prober.js
 * Probes a target origin for hidden/debug/admin endpoints.
 * Returns a list of discovered accessible paths with their HTTP status codes.
 * Sourced from references/spammer Mode 19 patterns.
 */

const https = require('https');
const http  = require('http');
const { URL } = require('url');

const PROBE_PATHS = [
  // ── Health / status ────────────────────────────────────────────────────────
  '/health', '/healthz', '/health-check', '/ping', '/status', '/ready',
  '/readyz', '/liveness', '/livez', '/up', '/ok', '/alive',
  // ── Info / version ─────────────────────────────────────────────────────────
  '/info', '/version', '/app/info', '/api/info', '/api/version', '/api/status',
  '/api/health', '/api/ping',
  // ── API versions ──────────────────────────────────────────────────────────
  '/api/v2', '/api/v3', '/api/v4', '/api/beta', '/api/dev', '/api/internal',
  '/api/admin', '/api/debug', '/api/test',
  // ── Admin / staff ─────────────────────────────────────────────────────────
  '/admin', '/admin/', '/administrator', '/staff', '/superuser', '/root',
  '/wp-admin', '/wp-login.php', '/cpanel', '/phpmyadmin', '/adminer',
  // ── Debug / dev tools ────────────────────────────────────────────────────
  '/debug', '/__debug__', '/dev', '/dev-tools', '/devtools', '/console',
  '/trace', '/__trace__', '/metrics', '/prometheus', '/actuator',
  '/actuator/env', '/actuator/health', '/actuator/info', '/actuator/metrics',
  // ── Config / environment ──────────────────────────────────────────────────
  '/.env', '/config', '/config.json', '/config.yaml', '/config.yml',
  '/env.json', '/app.config.js', '/settings.json', '/secrets.json',
  '/web.config', '/app.config', '/local.settings.json',
  // ── Backups / exports ─────────────────────────────────────────────────────
  '/backup', '/backups', '/dump', '/dump.sql', '/database.sql', '/db.sql',
  '/export', '/exports', '/archive', '/download', '/downloads',
  // ── Source code / git ────────────────────────────────────────────────────
  '/.git/HEAD', '/.git/config', '/.gitignore', '/.svn/entries',
  '/composer.json', '/package.json', '/yarn.lock', '/Gemfile',
  '/requirements.txt', '/Pipfile',
  // ── Logs ─────────────────────────────────────────────────────────────────
  '/logs', '/log', '/error.log', '/access.log', '/app.log', '/debug.log',
  // ── Internal / private ───────────────────────────────────────────────────
  '/private', '/internal', '/intranet', '/restricted', '/secure',
  '/hidden', '/__internal__',
  // ── GraphQL ──────────────────────────────────────────────────────────────
  '/graphql', '/api/graphql', '/gql', '/query',
  '/graphql/console', '/graphql/playground', '/graphiql', '/voyager',
  // ── Misc ─────────────────────────────────────────────────────────────────
  '/robots.txt', '/sitemap.xml', '/sitemap.txt', '/.well-known/security.txt',
  '/.well-known/change-password', '/security.txt', '/humans.txt',
  '/crossdomain.xml', '/clientaccesspolicy.xml',
];

/**
 * Probe a single URL path.
 * Returns { path, status, accessible, contentType, size, redirectTo }
 */
function probeOne(origin, probePath, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let fullUrl;
    try { fullUrl = new URL(probePath, origin).href; } catch {
      return resolve({ path: probePath, status: null, accessible: false, error: 'bad url' });
    }

    const parsed = new URL(fullUrl);
    const mod = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   'GET',
      headers:  { 'User-Agent': 'Mozilla/5.0 (compatible; probe/1.0)', 'Accept': '*/*' },
      timeout:  timeoutMs,
      rejectUnauthorized: false,
    };

    const req = mod.request(options, (res) => {
      let size = 0;
      res.on('data', chunk => { size += chunk.length; res.destroy(); }); // don't download full body
      res.on('close', () => {
        const status = res.statusCode;
        const accessible = status >= 200 && status < 300;
        const redirect = (status >= 300 && status < 400) ? res.headers['location'] : null;
        resolve({
          path: probePath,
          status,
          accessible,
          contentType: res.headers['content-type'] || null,
          contentLength: res.headers['content-length'] ? parseInt(res.headers['content-length']) : size,
          redirectTo: redirect || null,
        });
      });
    });

    req.on('timeout', () => { req.destroy(); resolve({ path: probePath, status: null, accessible: false, error: 'timeout' }); });
    req.on('error', (err) => resolve({ path: probePath, status: null, accessible: false, error: err.code || err.message }));
    req.end();
  });
}

/**
 * Probe all paths against a target origin with concurrency limiting.
 * @param {string} targetUrl - full URL (origin is extracted)
 * @param {object} opts
 * @param {number} opts.concurrency - parallel probes (default 10)
 * @param {number} opts.timeoutMs   - per-probe timeout ms (default 5000)
 * @param {function} opts.onProgress - callback(done, total, result)
 * @returns {Promise<{ results, summary }>}
 */
async function probeEndpoints(targetUrl, opts = {}) {
  const { concurrency = 10, timeoutMs = 5000, onProgress } = opts;

  let origin;
  try { origin = new URL(targetUrl).origin; }
  catch { throw new Error('Invalid target URL'); }

  const results = [];
  const total = PROBE_PATHS.length;
  let done = 0;

  // Chunked concurrency
  for (let i = 0; i < total; i += concurrency) {
    const batch = PROBE_PATHS.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(p => probeOne(origin, p, timeoutMs)));
    for (const r of batchResults) {
      results.push(r);
      done++;
      if (onProgress) onProgress(done, total, r);
    }
  }

  const accessible   = results.filter(r => r.accessible);
  const redirects    = results.filter(r => r.status >= 300 && r.status < 400);
  const errors       = results.filter(r => !r.status);
  const interesting  = results.filter(r => r.status && r.status !== 404 && r.status !== 410);

  return {
    results,
    summary: {
      total, accessible: accessible.length,
      redirects: redirects.length, errors: errors.length,
      interesting: interesting.length,
    },
    accessible,
    interesting,
  };
}

module.exports = { probeEndpoints, PROBE_PATHS };
