/**
 * endpoint-prober.js
 * Probes a target origin for hidden/debug/admin endpoints.
 * Returns a list of discovered accessible paths with their HTTP status codes.
 */

const https = require('https');
const http  = require('http');
const { URL } = require('url');

const PROBE_PATHS = [
  // ── Health / status ────────────────────────────────────────────────────────
  '/health', '/healthz', '/health-check', '/healthcheck', '/ping', '/status',
  '/ready', '/readyz', '/liveness', '/livez', '/up', '/ok', '/alive', '/heartbeat',
  // ── Info / version ─────────────────────────────────────────────────────────
  '/info', '/version', '/app/info', '/api/info', '/api/version', '/api/status',
  '/api/health', '/api/ping', '/api/v1', '/api/v2', '/api/v3', '/api/v4',
  '/api/beta', '/api/dev', '/api/internal', '/api/admin', '/api/debug', '/api/test',
  // ── OpenAPI / Swagger / docs ──────────────────────────────────────────────
  '/swagger.json', '/swagger.yaml', '/swagger-ui.html', '/swagger-ui/',
  '/openapi.json', '/openapi.yaml', '/openapi/',
  '/api-docs', '/api-docs.json', '/api/docs', '/api/swagger',
  '/docs', '/docs/api', '/v1/api-docs', '/v2/api-docs', '/v3/api-docs',
  '/redoc', '/api/redoc',
  // ── GraphQL ──────────────────────────────────────────────────────────────
  '/graphql', '/api/graphql', '/gql', '/query',
  '/graphql/console', '/graphql/playground', '/graphiql', '/voyager',
  '/api/gql', '/graph', '/graph/ql',
  // ── Admin / staff ─────────────────────────────────────────────────────────
  '/admin', '/admin/', '/administrator', '/admin/login', '/admin/dashboard',
  '/staff', '/superuser', '/root', '/portal',
  '/wp-admin', '/wp-login.php', '/wp-json/wp/v2/',
  '/cpanel', '/phpmyadmin', '/adminer', '/manage',
  // ── Metrics / monitoring ─────────────────────────────────────────────────
  '/metrics', '/prometheus', '/actuator', '/actuator/env', '/actuator/health',
  '/actuator/info', '/actuator/metrics', '/actuator/mappings', '/actuator/beans',
  '/metrics.json', '/stats', '/statistics',
  // ── Debug / dev tools ────────────────────────────────────────────────────
  '/debug', '/__debug__', '/dev', '/dev-tools', '/devtools', '/console',
  '/trace', '/__trace__', '/__profiler__', '/profiler',
  // ── Config / environment ──────────────────────────────────────────────────
  '/.env', '/.env.local', '/.env.development', '/.env.production', '/.env.example',
  '/.env.staging', '/.env.test', '/env.json', '/env', '/.config',
  '/config', '/config.json', '/config.yaml', '/config.yml', '/config.xml',
  '/app.config.js', '/settings.json', '/secrets.json',
  '/web.config', '/app.config', '/local.settings.json', '/application.properties',
  '/application.yml', '/appsettings.json',
  // ── Backups / exports ─────────────────────────────────────────────────────
  '/backup', '/backups', '/dump', '/dump.sql', '/database.sql', '/db.sql',
  '/backup.zip', '/backup.tar.gz', '/data.json', '/export', '/exports',
  '/archive', '/download', '/downloads',
  // ── Source code / git / deps ─────────────────────────────────────────────
  '/.git/HEAD', '/.git/config', '/.gitignore', '/.svn/entries',
  '/composer.json', '/package.json', '/package-lock.json', '/yarn.lock',
  '/Gemfile', '/Gemfile.lock', '/requirements.txt', '/Pipfile', '/go.sum',
  '/Cargo.toml', '/pom.xml', '/build.gradle',
  // ── Logs ─────────────────────────────────────────────────────────────────
  '/logs', '/log', '/error.log', '/access.log', '/app.log', '/debug.log',
  '/storage/logs/laravel.log',
  // ── Internal / private ───────────────────────────────────────────────────
  '/private', '/internal', '/intranet', '/restricted', '/secure', '/hidden',
  '/__internal__', '/backend', '/service',
  // ── Auth / session ────────────────────────────────────────────────────────
  '/.well-known/openid-configuration', '/.well-known/oauth-authorization-server',
  '/.well-known/jwks.json', '/oauth/token', '/oauth/authorize',
  '/auth/token', '/auth/login', '/auth/logout', '/session',
  // ── Standard well-known ──────────────────────────────────────────────────
  '/robots.txt', '/sitemap.xml', '/sitemap.txt', '/.well-known/security.txt',
  '/.well-known/change-password', '/security.txt', '/humans.txt',
  '/crossdomain.xml', '/clientaccesspolicy.xml', '/favicon.ico',
  // ── Cloud / serverless ────────────────────────────────────────────────────
  '/__functions__', '/.netlify/functions/', '/api/functions',
  '/.vercel/', '/vercel.json', '/next.config.js',
];

// Category tags for path classification
const PATH_CATEGORIES = [
  { re: /\/graphql|\/gql|\/graph\b|\/voyager|\/graphiql/i,                   label: 'graphql' },
  { re: /swagger|openapi|api-docs|\/docs|redoc/i,                             label: 'api-docs' },
  { re: /actuator|\/metrics|\/prometheus|\/stats/i,                           label: 'metrics' },
  { re: /admin|administrator|superuser|phpmyadmin|cpanel|adminer|manage/i,    label: 'admin' },
  { re: /debug|trace|devtools|profiler|console/i,                             label: 'debug' },
  { re: /\.env|config|settings|secrets|application\.(yml|properties)/i,       label: 'config' },
  { re: /backup|dump|\.sql|export|archive/i,                                  label: 'backup' },
  { re: /\.git|\.gitignore|package\.json|composer|Gemfile|requirements/i,     label: 'source' },
  { re: /logs?|access\.log|error\.log|debug\.log/i,                           label: 'logs' },
  { re: /openid|jwks|oauth|\/auth\//i,                                        label: 'auth' },
  { re: /health|ping|status|ready|liveness|heartbeat/i,                       label: 'health' },
  { re: /\/api\/v\d+|\/api\b/i,                                               label: 'api' },
];

function categorize(path) {
  for (const { re, label } of PATH_CATEGORIES) {
    if (re.test(path)) return label;
  }
  return 'other';
}

/**
 * Probe a single path — HEAD first, fall back to GET for body sniffing.
 */
function probeOne(origin, probePath, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let fullUrl;
    try { fullUrl = new URL(probePath, origin).href; } catch {
      return resolve({ path: probePath, status: null, accessible: false, error: 'bad url' });
    }

    const parsed  = new URL(fullUrl);
    const mod     = parsed.protocol === 'https:' ? https : http;
    const baseOpts = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      headers:  { 'User-Agent': 'Mozilla/5.0 (compatible; probe/1.0)', 'Accept': '*/*' },
      timeout:  timeoutMs,
      rejectUnauthorized: false,
    };

    // Phase 1: HEAD to get status quickly
    const headReq = mod.request({ ...baseOpts, method: 'HEAD' }, (headRes) => {
      headRes.resume(); // drain
      const status      = headRes.statusCode;
      const contentType = headRes.headers['content-type'] || null;
      const accessible  = status >= 200 && status < 300;
      const redirect    = (status >= 300 && status < 400) ? headRes.headers['location'] : null;
      const category    = categorize(probePath);

      if (!accessible || headRes.statusCode === 405) {
        // 405 Method Not Allowed means HEAD is blocked — try GET below
        if (status === 405 || status === 400) {
          doGet();
        } else {
          resolve({ path: probePath, status, accessible, contentType, contentLength: null, redirectTo: redirect, category });
        }
        return;
      }

      // Accessible — do a GET to peek at body
      doGet(status, contentType, redirect, category);
    });

    headReq.on('timeout', () => { headReq.destroy(); doGet(); });
    headReq.on('error', () => doGet());
    headReq.end();

    // Phase 2: GET for body preview (max 512 bytes)
    let getStarted = false;
    function doGet(headStatus, headContentType, headRedirect, headCategory) {
      if (getStarted) return;
      getStarted = true;

      const getReq = mod.request({ ...baseOpts, method: 'GET' }, (res) => {
        const status      = headStatus  ?? res.statusCode;
        const contentType = headContentType ?? res.headers['content-type'] ?? null;
        const redirect    = headRedirect ?? ((res.statusCode >= 300 && res.statusCode < 400) ? res.headers['location'] : null);
        const category    = headCategory ?? categorize(probePath);
        const accessible  = status >= 200 && status < 300;

        const chunks = [];
        let collected = 0;
        res.on('data', (chunk) => {
          if (collected < 512) {
            const take = Math.min(chunk.length, 512 - collected);
            chunks.push(chunk.slice(0, take));
            collected += take;
          }
          if (collected >= 512) res.destroy();
        });
        res.on('close', () => {
          const bodyPreview = collected > 0 ? Buffer.concat(chunks).toString('utf8').slice(0, 512) : null;
          resolve({
            path:          probePath,
            status,
            accessible,
            contentType,
            contentLength: res.headers['content-length'] ? parseInt(res.headers['content-length']) : collected,
            redirectTo:    redirect,
            category,
            bodyPreview:   bodyPreview && /^[\[{]/.test(bodyPreview.trimStart()) ? bodyPreview : null, // only for JSON
          });
        });
      });

      getReq.on('timeout', () => { getReq.destroy(); resolve({ path: probePath, status: headStatus ?? null, accessible: !!(headStatus && headStatus < 300), contentType: headContentType ?? null, contentLength: null, redirectTo: headRedirect ?? null, category: headCategory ?? categorize(probePath) }); });
      getReq.on('error', (err) => resolve({ path: probePath, status: headStatus ?? null, accessible: false, error: err.code || err.message, category: categorize(probePath) }));
      getReq.end();
    }
  });
}

/**
 * Probe all paths against a target origin with concurrency limiting.
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

  // Aggregate accessible by category
  const byCategory = {};
  for (const r of accessible) {
    const cat = r.category || 'other';
    (byCategory[cat] = byCategory[cat] || []).push(r.path);
  }

  return {
    results,
    summary: {
      total, accessible: accessible.length,
      redirects: redirects.length, errors: errors.length,
      interesting: interesting.length,
      byCategory,
    },
    accessible,
    interesting,
  };
}

module.exports = { probeEndpoints, PROBE_PATHS };
