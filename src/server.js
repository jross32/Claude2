require('dotenv').config();

// ---- Crash guards ----
process.on('uncaughtException', (err) => {
  console.error('[CRASH] uncaughtException:', err.message, err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('[CRASH] unhandledRejection:', reason?.message || reason);
});

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const ScraperSession = require('./scraper');

const SAVES_DIR = path.join(__dirname, '../scrape-saves');
const { clearSession } = require('./scraper');
const { exportHAR } = require('./har-exporter');
const { inferSchema } = require('./schema-inferrer');
const { diffScrapes } = require('./diff');
const { createSchedule, deleteSchedule, listSchedules } = require('./scheduler');
const { generateReact, extractCSS, generateMarkdown, generateSitemap } = require('./generators');
const gitAutosave = require('./git-autosave');
const { performOidcSecurityTests, testTlsFingerprint } = require('./oidc-tester');
const {
  handleTool: handleMcpTool,
  __private__: {
    analyzeResearchQuestion,
    normalizeCompletedScrapeResult,
    toResearchPage,
  },
} = require('../mcp-server');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// ── In-memory rate limiter ─────────────────────────────────────────────────
// Protects against runaway AI agents or accidental loops hammering the API.
// Limits are generous — this is a local tool, not a public service.
const _rlWindows = new Map(); // key -> { count, windowStart }
function _checkRateLimit(key, maxPerMinute) {
  const now = Date.now();
  const w = _rlWindows.get(key) || { count: 0, windowStart: now };
  if (now - w.windowStart > 60000) { w.count = 0; w.windowStart = now; }
  w.count++;
  _rlWindows.set(key, w);
  return w.count > maxPerMinute;
}
setInterval(() => {
  const cutoff = Date.now() - 60000;
  for (const [k, w] of _rlWindows.entries()) { if (w.windowStart < cutoff) _rlWindows.delete(k); }
}, 5 * 60 * 1000).unref?.();

// Limits: scrape endpoints 30/min, generate/analysis endpoints 60/min, everything else 120/min
app.use((req, res, next) => {
  const ip = req.ip || 'local';
  let limit = 120;
  if (/^\/api\/(scrape|fill-form|screenshot|oidc-test|tls-fingerprint)/.test(req.path)) limit = 30;
  else if (/^\/api\/(generate|schema|diff|schedules|monitor)/.test(req.path)) limit = 60;
  if (_checkRateLimit(`${ip}:${req.method}:${req.path.split('/').slice(0, 4).join('/')}`, limit)) {
    return res.status(429).json({ error: 'Rate limit exceeded — slow down requests', retryAfterSeconds: 60 });
  }
  next();
});

// ── Optional API key gate ──────────────────────────────────────────────────
// Set API_KEY in .env to require x-api-key or Authorization: Bearer <key> on all /api/ routes.
if (process.env.API_KEY) {
  app.use('/api/', (req, res, next) => {
    const provided = req.headers['x-api-key'] ||
      (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!provided || provided !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized — provide x-api-key or Authorization: Bearer <key>' });
    }
    next();
  });
}

// ── Input validation helper ────────────────────────────────────────────────
function _require(body, ...fields) {
  for (const f of fields) {
    const v = body?.[f];
    if (v === undefined || v === null || v === '') return `'${f}' is required`;
    if (typeof v === 'string' && !v.trim()) return `'${f}' must be a non-empty string`;
  }
  return null;
}
function _requireType(body, field, type) {
  const v = body?.[field];
  if (type === 'array' && !Array.isArray(v)) return `'${field}' must be an array`;
  if (type === 'string' && typeof v !== 'string') return `'${field}' must be a string`;
  if (type === 'number' && typeof v !== 'number') return `'${field}' must be a number`;
  return null;
}

// Active scraping sessions
const sessions = new Map();

const SCRAPE_STATUS_STATES = {
  RUNNING: 'running',
  PAUSED: 'paused',
  WAITING_AUTH: 'waiting_auth',
  WAITING_VERIFICATION: 'waiting_verification',
  STOPPING: 'stopping',
  COMPLETE: 'complete',
  STOPPED: 'stopped',
  ERROR: 'error',
};

function isActiveSessionState(state) {
  return ![
    SCRAPE_STATUS_STATES.COMPLETE,
    SCRAPE_STATUS_STATES.STOPPED,
    SCRAPE_STATUS_STATES.ERROR,
  ].includes(state);
}

// WebSocket connection for real-time progress
wss.on('connection', (ws) => {
  ws.id = uuidv4();
  ws.on('error', (err) => console.error('WS error:', err));
});

function broadcast(sessionId, data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ sessionId, ...data }));
    }
  });
}

// Known site credentials from .env — keyed by hostname fragment
const KNOWN_SITES = [
  {
    match: 'poolplayers.com',
    username: process.env.APA_USERNAME,
    password: process.env.APA_PASSWORD,
  },
];

function parseBooleanFlag(value, defaultValue = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value !== 'string') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function getSaveUiVisible(save) {
  return save?.uiVisible !== false;
}

function getSaveInitiator(save) {
  if (typeof save?.initiatedBy === 'string' && save.initiatedBy.trim()) {
    return save.initiatedBy.trim();
  }
  return getSaveUiVisible(save) ? 'ui' : 'mcp';
}

function sanitizeSessionSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  return {
    sessionId: snapshot.sessionId || '',
    state: snapshot.state || SCRAPE_STATUS_STATES.RUNNING,
    targetUrl: snapshot.targetUrl || '',
    startedAt: snapshot.startedAt || null,
    updatedAt: snapshot.updatedAt || null,
    step: snapshot.step || '',
    percent: Number.isFinite(snapshot.percent) ? snapshot.percent : 0,
    visited: Number.isFinite(snapshot.visited) ? snapshot.visited : 0,
    total: Number.isFinite(snapshot.total) ? snapshot.total : null,
    queued: Number.isFinite(snapshot.queued) ? snapshot.queued : 0,
    failed: Number.isFinite(snapshot.failed) ? snapshot.failed : 0,
    partialPageCount: Number.isFinite(snapshot.partialPageCount) ? snapshot.partialPageCount : 0,
    graphqlCallCount: Number.isFinite(snapshot.graphqlCallCount) ? snapshot.graphqlCallCount : 0,
    restCallCount: Number.isFinite(snapshot.restCallCount) ? snapshot.restCallCount : 0,
    needsAuth: !!snapshot.needsAuth,
    needsVerification: !!snapshot.needsVerification,
    lastError: snapshot.lastError || null,
    uiVisible: snapshot.uiVisible !== false,
    initiatedBy: typeof snapshot.initiatedBy === 'string' && snapshot.initiatedBy.trim()
      ? snapshot.initiatedBy.trim()
      : (snapshot.uiVisible === false ? 'mcp' : 'ui'),
  };
}

function mapSavedStatus(status) {
  const value = String(status || '').toLowerCase();
  if (!value) return SCRAPE_STATUS_STATES.COMPLETE;
  if (value.includes('paused')) return SCRAPE_STATUS_STATES.PAUSED;
  if (value.includes('verification')) return SCRAPE_STATUS_STATES.WAITING_VERIFICATION;
  if (value.includes('auth')) return SCRAPE_STATUS_STATES.WAITING_AUTH;
  if (value.includes('stopping')) return SCRAPE_STATUS_STATES.STOPPING;
  if (value.includes('stopped')) return SCRAPE_STATUS_STATES.STOPPED;
  if (value.includes('error') || value.includes('fail')) return SCRAPE_STATUS_STATES.ERROR;
  if (value.includes('run')) return SCRAPE_STATUS_STATES.RUNNING;
  return SCRAPE_STATUS_STATES.COMPLETE;
}

function statusStepLabel(state) {
  switch (state) {
    case SCRAPE_STATUS_STATES.PAUSED: return 'Paused';
    case SCRAPE_STATUS_STATES.WAITING_AUTH: return 'Waiting for credentials';
    case SCRAPE_STATUS_STATES.WAITING_VERIFICATION: return 'Waiting for verification';
    case SCRAPE_STATUS_STATES.STOPPING: return 'Stopping scrape';
    case SCRAPE_STATUS_STATES.STOPPED: return 'Scrape stopped';
    case SCRAPE_STATUS_STATES.ERROR: return 'Scrape error';
    case SCRAPE_STATUS_STATES.RUNNING: return 'Scrape in progress';
    default: return 'Saved scrape ready';
  }
}

function buildSavedSessionSnapshot(save) {
  const pages = Array.isArray(save?.pages) ? save.pages : [];
  const visitedUrls = Array.isArray(save?.visitedUrls) ? save.visitedUrls : [];
  const failedPages = Array.isArray(save?.failedPages) ? save.failedPages : [];
  const graphqlCalls = Array.isArray(save?.apiCalls?.graphql) ? save.apiCalls.graphql : [];
  const restCalls = Array.isArray(save?.apiCalls?.rest) ? save.apiCalls.rest : [];
  const state = mapSavedStatus(save?.status);
  const requestedTotal = Number.isFinite(Number(save?.options?.maxPages)) && Number(save.options.maxPages) > 0
    ? Number(save.options.maxPages)
    : null;
  const visited = visitedUrls.length || pages.length;
  const partialPageCount = pages.length;
  const total = requestedTotal ?? partialPageCount ?? null;
  const completedUnits = Math.max(visited, partialPageCount);
  const percent = state === SCRAPE_STATUS_STATES.COMPLETE
    ? 100
    : total && total > 0
      ? Math.min(99, Math.round((completedUnits / total) * 100))
      : partialPageCount > 0
        ? 90
        : 0;

  return sanitizeSessionSnapshot({
    sessionId: save?.sessionId || '',
    state,
    targetUrl: save?.startUrl || save?.options?.url || '',
    startedAt: save?.startedAt || null,
    updatedAt: save?.lastSavedAt || save?.startedAt || null,
    step: statusStepLabel(state),
    percent,
    visited,
    total,
    queued: total && total > visited ? total - visited : 0,
    failed: failedPages.length,
    partialPageCount,
    graphqlCallCount: graphqlCalls.length,
    restCallCount: restCalls.length,
    needsAuth: false,
    needsVerification: false,
    lastError: state === SCRAPE_STATUS_STATES.ERROR
      ? failedPages[failedPages.length - 1]?.reason || 'Saved scrape recorded an error'
      : null,
    uiVisible: getSaveUiVisible(save),
    initiatedBy: getSaveInitiator(save),
  });
}

function loadSaveById(sessionId) {
  const file = path.join(SAVES_DIR, `${sessionId}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function getActiveSessionSnapshots() {
  return Array.from(sessions.values())
    .map((session) => {
      try {
        const snapshot = sanitizeSessionSnapshot(session.getStatusSnapshot?.());
        if (!snapshot) return null;
        if (!isActiveSessionState(snapshot.state)) return null;
        snapshot.uiVisible = session.uiVisible !== false;
        snapshot.initiatedBy = session.initiatedBy || (snapshot.uiVisible ? 'ui' : 'mcp');
        return snapshot;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function buildAiContextPage(result) {
  if (!result || typeof result !== 'object') return null;

  const graphqlCalls = Array.isArray(result.apiCalls?.graphql) ? result.apiCalls.graphql : [];
  const restCalls = Array.isArray(result.apiCalls?.rest) ? result.apiCalls.rest : [];
  const cookies = Array.isArray(result.cookies) ? result.cookies : [];
  const securityHeaders = result.securityHeaders && typeof result.securityHeaders === 'object'
    ? Object.entries(result.securityHeaders)
        .map(([name, value]) => `${name}: ${String(value)}`)
        .slice(0, 20)
    : [];
  const visitedUrls = Array.isArray(result.visitedUrls) ? result.visitedUrls.slice(0, 20) : [];
  const failedPages = Array.isArray(result.failedPages) ? result.failedPages.slice(0, 10) : [];
  const consoleLogs = Array.isArray(result.consoleLogs) ? result.consoleLogs.slice(-12) : [];
  const apiEndpoints = [
    ...graphqlCalls.map((call) => call.endpoint || call.url).filter(Boolean),
    ...restCalls.map((call) => call.url).filter(Boolean),
  ].slice(0, 25);

  const lines = [
    `Start URL: ${result.startUrl || result.siteInfo?.origin || ''}`,
    `Page count: ${Array.isArray(result.pages) ? result.pages.length : 0}`,
    `Visited URL count: ${Array.isArray(result.visitedUrls) ? result.visitedUrls.length : 0}`,
    `GraphQL call count: ${graphqlCalls.length}`,
    `REST call count: ${restCalls.length}`,
    `Asset count: ${Array.isArray(result.assets) ? result.assets.length : 0}`,
    `Cookie names: ${cookies.map((cookie) => cookie.name).filter(Boolean).slice(0, 25).join(', ') || 'none captured'}`,
    `Security headers: ${securityHeaders.join(' | ') || 'none captured'}`,
    `Visited URLs:\n${visitedUrls.join('\n') || 'none captured'}`,
    `Failed pages:\n${failedPages.map((page) => `${page.url || ''} — ${page.reason || 'unknown failure'}`).join('\n') || 'none'}`,
    `API endpoints:\n${apiEndpoints.join('\n') || 'none captured'}`,
    `Recent console logs:\n${consoleLogs.map((entry) => `${entry.level || 'log'}: ${entry.text || entry.message || ''}`).join('\n') || 'none captured'}`,
  ];

  return {
    url: 'about:scrape-context',
    title: 'Scrape Context Summary',
    description: 'Synthetic summary of the current scrape metadata, API activity, cookies, headers, and crawl results.',
    fullText: lines.join('\n\n'),
    headings: {
      h1: ['Scrape Context Summary'],
      h2: ['Metadata', 'Visited URLs', 'API Endpoints', 'Console Logs'],
    },
    links: visitedUrls.map((url) => ({ href: url, text: url })),
  };
}

function buildAiCurrentSourcePayload(scrapeData) {
  const normalized = normalizeCompletedScrapeResult(scrapeData);
  const pages = (Array.isArray(normalized?.pages) ? normalized.pages : [])
    .map((page) => toResearchPage(page))
    .filter((page) => page && (page.url || page.title || page.fullText));
  const contextPage = buildAiContextPage(normalized);
  if (contextPage) pages.unshift(contextPage);
  return { normalized, pages };
}

function unwrapMcpToolResult(result) {
  if (!result || typeof result !== 'object') return result;
  if (result.isError) {
    const error = result.structuredContent?.error || { message: result.content?.[0]?.text || 'Tool failed' };
    const err = new Error(error.message || 'Tool failed');
    err.code = error.code || 'tool_failed';
    err.retryable = !!error.retryable;
    err.suggestedNextStep = error.suggestedNextStep || null;
    throw err;
  }
  return result.structuredContent?.data || result;
}

// Lightweight site detection — fetch title + favicon without launching a scrape
// Proxy a favicon so the frontend avoids CORS issues and can resolve it from any URL
app.get('/api/favicon', async (req, res) => {
  const rawUrl = req.query.url || '';
  if (!rawUrl) return res.status(400).send('url required');
  const https = require('https');
  const http  = require('http');
  const { URL } = require('url');

  async function fetchBytes(url) {
    return new Promise((resolve, reject) => {
      let parsed;
      try { parsed = new URL(url); } catch { return reject(new Error('bad url')); }
      const mod = parsed.protocol === 'https:' ? https : http;
      const req2 = mod.get(url, { timeout: 6000, headers: { 'User-Agent': 'Mozilla/5.0' } }, (r) => {
        if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
          return fetchBytes(r.headers.location).then(resolve).catch(reject);
        }
        const ct = r.headers['content-type'] || '';
        if (!ct.includes('image') && !ct.includes('octet') && !url.endsWith('.ico')) {
          r.destroy(); return reject(new Error('not image'));
        }
        const chunks = [];
        r.on('data', c => chunks.push(c));
        r.on('end', () => resolve({ buf: Buffer.concat(chunks), ct }));
      });
      req2.on('error', reject);
      req2.on('timeout', () => { req2.destroy(); reject(new Error('timeout')); });
    });
  }

  let origin, hostname;
  try { const p = new URL(rawUrl); origin = p.origin; hostname = p.hostname; }
  catch { return res.status(400).send('bad url'); }

  // Helper: fetch a URL as text (HTML)
  async function fetchText(url) {
    return new Promise((resolve, reject) => {
      let parsed; try { parsed = new URL(url); } catch { return reject(new Error('bad url')); }
      const mod = parsed.protocol === 'https:' ? https : http;
      const req2 = mod.get(url, { timeout: 6000, headers: { 'User-Agent': 'Mozilla/5.0' } }, (r) => {
        if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
          return fetchText(r.headers.location).then(resolve).catch(reject);
        }
        let data = '';
        r.on('data', c => { data += c; if (data.length > 60000) r.destroy(); });
        r.on('end', () => resolve(data));
        r.on('close', () => resolve(data));
      });
      req2.on('error', reject);
      req2.on('timeout', () => { req2.destroy(); reject(new Error('timeout')); });
    });
  }

  // 1. Try parsing the page HTML for <link rel="icon">
  try {
    const html = await fetchText(rawUrl);
    const m = html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i)
           || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*icon[^"']*["']/i);
    if (m) {
      let iconHref = m[1];
      if (!iconHref.startsWith('http')) iconHref = iconHref.startsWith('/') ? `${origin}${iconHref}` : `${origin}/${iconHref}`;
      const { buf, ct } = await fetchBytes(iconHref);
      if (buf.length > 0) {
        res.set('Content-Type', ct || 'image/x-icon');
        res.set('Cache-Control', 'public, max-age=86400');
        return res.send(buf);
      }
    }
  } catch {}

  // 2. Try /favicon.ico, then /apple-touch-icon.png
  for (const candidate of [`${origin}/favicon.ico`, `${origin}/apple-touch-icon.png`]) {
    try {
      const { buf, ct } = await fetchBytes(candidate);
      if (buf.length > 0) {
        res.set('Content-Type', ct || 'image/x-icon');
        res.set('Cache-Control', 'public, max-age=86400');
        return res.send(buf);
      }
    } catch {}
  }

  // 3. Google as last resort
  res.redirect(`https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(hostname)}`);
});

app.get('/api/detect', async (req, res) => {
  const url = req.query.url || '';
  if (!url) return res.status(400).json({ error: 'No URL' });
  try {
    const https = require('https');
    const http = require('http');
    const { URL } = require('url');
    const parsed = new URL(url);
    const origin = parsed.origin;

    let responseHeaders = {};
    let statusCode = 0;
    let finalUrl = url;

    const body = await new Promise((resolve, reject) => {
      const mod = parsed.protocol === 'https:' ? https : http;
      const req2 = mod.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } }, (r) => {
        statusCode = r.statusCode;
        responseHeaders = r.headers;
        // Follow one redirect
        if ((r.statusCode === 301 || r.statusCode === 302 || r.statusCode === 307 || r.statusCode === 308) && r.headers.location) {
          finalUrl = r.headers.location.startsWith('http') ? r.headers.location : `${origin}${r.headers.location}`;
          r.destroy();
          return resolve('');
        }
        let data = '';
        r.on('data', (chunk) => { data += chunk; if (data.length > 80000) r.destroy(); });
        r.on('end', () => resolve(data));
        r.on('close', () => resolve(data));
      });
      req2.on('error', reject);
      req2.on('timeout', () => { req2.destroy(); reject(new Error('timeout')); });
    });

    const titleMatch = body.match(/<title[^>]*>([^<]{0,200})<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : parsed.hostname;

    const faviconMatch = body.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i)
      || body.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*icon[^"']*["']/i);
    let favicon = faviconMatch ? faviconMatch[1] : '/favicon.ico';
    if (favicon && !favicon.startsWith('http')) {
      favicon = favicon.startsWith('/') ? `${origin}${favicon}` : `${origin}/${favicon}`;
    }

    const descMatch = body.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,300})["']/i);
    const description = descMatch ? descMatch[1].trim() : '';

    // ── CMS / platform detection ───────────────────────────────────────────
    const cms = [];
    if (/wp-content|wp-includes|wordpress/i.test(body)) cms.push('WordPress');
    if (/shopify\.com|cdn\.shopify|Shopify\.theme/i.test(body)) cms.push('Shopify');
    if (/drupal\.js|drupal\/core|Drupal\.settings/i.test(body)) cms.push('Drupal');
    if (/joomla|\/components\/com_/i.test(body)) cms.push('Joomla');
    if (/squarespace\.com|static\.squarespace/i.test(body)) cms.push('Squarespace');
    if (/wix\.com|wixsite\.com|_wix_/i.test(body)) cms.push('Wix');
    if (/webflow\.io|webflow\.com/i.test(body)) cms.push('Webflow');
    if (/ghost\.io|ghost-sdk/i.test(body)) cms.push('Ghost');
    if (/hubspot\.com|hs-scripts|_hsp_/i.test(body)) cms.push('HubSpot');
    if (/magento|Mage\.Cookies/i.test(body)) cms.push('Magento');
    if (/bigcommerce\.com|stencil\.bigcommerce/i.test(body)) cms.push('BigCommerce');
    if (responseHeaders['x-powered-by'] && /php/i.test(responseHeaders['x-powered-by'])) cms.push('PHP');

    // ── JS framework detection ─────────────────────────────────────────────
    const frameworks = [];
    if (/__NEXT_DATA__|_next\/static|next\.config/i.test(body)) frameworks.push('Next.js');
    if (/nuxt|__nuxt__|_nuxt\//i.test(body)) frameworks.push('Nuxt.js');
    if (/ng-version|angular\.min\.js|ngApp/i.test(body)) frameworks.push('Angular');
    if (/data-reactroot|__react|react\.development|react\.production/i.test(body)) frameworks.push('React');
    if (/__vue__|vue\.min\.js|v-on:|v-bind:/i.test(body)) frameworks.push('Vue.js');
    if (/gatsby-image|gatsby-ssr/i.test(body)) frameworks.push('Gatsby');
    if (/svelte|__svelte/i.test(body)) frameworks.push('Svelte');
    if (/__REMIX__|remix\.run/i.test(body)) frameworks.push('Remix');
    if (/astro-island|astro:script/i.test(body)) frameworks.push('Astro');

    // ── Rendering mode ─────────────────────────────────────────────────────
    const isSpa = frameworks.some(f => ['React', 'Vue.js', 'Angular', 'Svelte'].includes(f))
      && !frameworks.some(f => ['Next.js', 'Nuxt.js', 'Gatsby', 'Remix', 'Astro'].includes(f));
    const renderingMode = isSpa ? 'SPA (client-side)' : frameworks.length ? 'SSR/SSG' : 'Unknown';

    // ── Login / auth detection ─────────────────────────────────────────────
    const hasLoginForm = /<form[^>]*>[\s\S]{0,2000}?(?:type=["']password["']|name=["']password["'])/i.test(body);
    const hasOAuth = /google.*oauth|oauth.*google|sign in with google|continue with google|facebook login|sign in with apple|login with github/i.test(body);
    const requiresAuth = hasLoginForm || hasOAuth;

    // ── Anti-bot / CAPTCHA detection ──────────────────────────────────────
    const antiBot = [];
    if (/cloudflare|cf-challenge|cf-turnstile|cf-chl-/i.test(body) || (responseHeaders['server'] || '').toLowerCase().includes('cloudflare')) antiBot.push('Cloudflare');
    if (/g-recaptcha|grecaptcha|recaptcha\.net/i.test(body)) antiBot.push('reCAPTCHA');
    if (/h-captcha|hcaptcha\.com/i.test(body)) antiBot.push('hCaptcha');
    if (/datadome|dd\.js/i.test(body)) antiBot.push('DataDome');
    if (/px\.js|perimeterx\.net/i.test(body)) antiBot.push('PerimeterX');
    if (/imperva|incapsula/i.test(body)) antiBot.push('Imperva');

    // ── Language / locale detection ────────────────────────────────────────
    const langMatch = body.match(/<html[^>]+lang=["']([a-zA-Z\-]{2,10})["']/i);
    const language = langMatch ? langMatch[1] : (responseHeaders['content-language'] || null);

    // ── Security headers ───────────────────────────────────────────────────
    const securityHeaders = {
      hsts: !!responseHeaders['strict-transport-security'],
      csp: !!responseHeaders['content-security-policy'],
      xFrame: !!responseHeaders['x-frame-options'],
      xContentType: !!responseHeaders['x-content-type-options'],
    };

    res.json({
      title, favicon, url, finalUrl, description,
      statusCode,
      cms: cms.length ? cms : null,
      frameworks: frameworks.length ? frameworks : null,
      renderingMode,
      requiresAuth,
      hasLoginForm,
      hasOAuth,
      antiBot: antiBot.length ? antiBot : null,
      language,
      server: responseHeaders['server'] || null,
      securityHeaders,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check if a saved session exists for a URL
app.get('/api/session/check', (req, res) => {
  const url = req.query.url || '';
  const fs = require('fs');
  const path = require('path');
  try {
    const hostname = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_');
    const file = path.join(__dirname, '../.scraper-sessions', `${hostname}.json`);
    res.json({ exists: fs.existsSync(file) });
  } catch { res.json({ exists: false }); }
});

// Clear saved session for a URL
app.delete('/api/session', (req, res) => {
  const url = req.query.url || '';
  const cleared = clearSession(url);
  res.json({ cleared });
});

// Return pre-configured credentials for a URL (never logs the password)
app.get('/api/site-credentials', (req, res) => {
  const url = req.query.url || '';
  for (const site of KNOWN_SITES) {
    if (url.includes(site.match) && site.username && site.password) {
      return res.json({ found: true, username: site.username });
    }
  }
  res.json({ found: false });
});

// ---- Scrape ----
app.post('/api/scrape', async (req, res) => {
  const {
    url,
    urls,
    hasAuth,
    username,
    password,
    verificationType,
    verificationCode,
    scrapeDepth,
    captureGraphQL,
    captureREST,
    captureAssets,
    avoidTags,
    capturePageUrls,
    captureAllRequests,
    captureImages,
    imageLimit,
    captureIframeAPIs,
    captureSSE,
    captureBeacons,
    captureBinaryResponses,
    captureServiceWorkers,
    bypassServiceWorkers,
    clickSequence,
    autoScroll,
    captureDropdowns,
    captureScreenshots,
    captureSpeed,
    workerCount,
    politeDelay,
    showBrowser,
    liveView,
    slowMotion,
    fullCrawl,
    maxPages,
    resumeFrom,
    proxy,
    uiVisible,
    initiatedBy,
    totpSecret,
    ssoProvider,
    useTor,
    redisDedupe,
  } = req.body;

  if (!url && (!urls || urls.length === 0)) {
    return res.status(400).json({ error: 'URL is required' });
  }
  if (url && typeof url !== 'string') return res.status(400).json({ error: `'url' must be a string` });
  if (urls && !Array.isArray(urls)) return res.status(400).json({ error: `'urls' must be an array` });
  if (maxPages !== undefined && maxPages !== null && (!Number.isInteger(Number(maxPages)) || Number(maxPages) < 1)) {
    return res.status(400).json({ error: `'maxPages' must be a positive integer` });
  }

  // Auto-inject credentials from .env for known sites
  let resolvedUsername = username;
  let resolvedPassword = password;
  const targetUrl = url || (urls && urls[0]) || '';
  for (const site of KNOWN_SITES) {
    if (targetUrl.includes(site.match) && site.username && site.password) {
      if (!resolvedUsername) resolvedUsername = site.username;
      if (!resolvedPassword) resolvedPassword = site.password;
      break;
    }
  }

  const sessionId = uuidv4();
  res.json({ sessionId, message: 'Scraping started' });

  const scraper = new ScraperSession(sessionId, broadcast);
  scraper.uiVisible = parseBooleanFlag(uiVisible, true);
  scraper.initiatedBy = typeof initiatedBy === 'string' && initiatedBy.trim()
    ? initiatedBy.trim()
    : (scraper.uiVisible ? 'ui' : 'mcp');
  sessions.set(sessionId, scraper);

  // Auto-cleanup: remove session after 45 minutes to prevent memory/browser leaks
  const CLEANUP_MS = 45 * 60 * 1000;
  const cleanupTimer = setTimeout(() => {
    if (sessions.has(sessionId)) {
      const s = sessions.get(sessionId);
      try { s.stop(); } catch {}
      broadcast(sessionId, { type: 'error', message: 'Session auto-cleaned after 45 minute timeout' });
    }
  }, CLEANUP_MS);
  cleanupTimer.unref?.();

  scraper
    .run({
      url,
      urls,
      hasAuth,
      username: resolvedUsername,
      password: resolvedPassword,
      verificationType,
      verificationCode,
      scrapeDepth: scrapeDepth || 1,
      captureGraphQL: captureGraphQL !== false,
      captureREST: captureREST !== false,
      captureAssets: captureAssets !== false,
      avoidTags: Array.isArray(avoidTags) ? avoidTags : [],
      capturePageUrls: capturePageUrls !== false,
      captureAllRequests: captureAllRequests || false,
      captureImages: captureImages || false,
      imageLimit: imageLimit !== undefined ? parseInt(imageLimit, 10) : 0,
      captureIframeAPIs: captureIframeAPIs || false,
      captureSSE: captureSSE || false,
      captureBeacons: captureBeacons || false,
      captureBinaryResponses: captureBinaryResponses || false,
      captureServiceWorkers: captureServiceWorkers || false,
      bypassServiceWorkers: bypassServiceWorkers || false,
      clickSequence: clickSequence || [],
      autoScroll: autoScroll || false,
      captureDropdowns: captureDropdowns || false,
      captureScreenshots: captureScreenshots || false,
      workerCount: workerCount ? parseInt(workerCount, 10) : 0,
      politeDelay: politeDelay ? parseInt(politeDelay, 10) : 0,
      captureSpeed: captureSpeed || 1,
      showBrowser: showBrowser || false,
      liveView: liveView || false,
      slowMotion: slowMotion || 0,
      fullCrawl: fullCrawl || false,
      maxPages: maxPages !== undefined && maxPages !== null ? parseInt(maxPages, 10) : 100,
      saveId: sessionId,
      resumeFrom: resumeFrom || null,
      proxy: proxy || null,
      uiVisible: scraper.uiVisible,
      initiatedBy: scraper.initiatedBy,
      totpSecret: totpSecret || null,
      ssoProvider: ssoProvider || null,
      useTor: parseBooleanFlag(useTor, false),
      redisDedupe: parseBooleanFlag(redisDedupe, false),
    })
    .then((result) => {
      clearTimeout(cleanupTimer);
      // Auto-attach HAR to result
      try { result.har = exportHAR(result); } catch {}
      try { scraper.markComplete(result); } catch {}
      broadcast(sessionId, { type: 'complete', data: result });
      sessions.delete(sessionId);
    })
    .catch((err) => {
      clearTimeout(cleanupTimer);
      if (scraper.stopped) {
        try { scraper.markStopped(); } catch {}
        broadcast(sessionId, { type: 'stopped', message: 'Scrape stopped' });
      } else {
        try { scraper.markError(err); } catch {}
        broadcast(sessionId, { type: 'error', message: err.message });
      }
      sessions.delete(sessionId);
    });
});

app.get('/api/scrape/active', (req, res) => {
  try {
    const includeHidden = parseBooleanFlag(req.query.includeHidden, false);
    const active = getActiveSessionSnapshots()
      .filter((snapshot) => includeHidden || snapshot.uiVisible !== false);
    res.json(active);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/scrape/:sessionId/status', (req, res) => {
  try {
    const liveSession = sessions.get(req.params.sessionId);
    if (liveSession?.getStatusSnapshot) {
      const snapshot = sanitizeSessionSnapshot(liveSession.getStatusSnapshot());
      if (snapshot) return res.json(snapshot);
    }

    const save = loadSaveById(req.params.sessionId);
    if (save) {
      return res.json(buildSavedSessionSnapshot(save));
    }

    return res.status(404).json({ error: 'Session not found' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ---- Saves API ----
app.get('/api/saves', (req, res) => {
  try {
    const includeHidden = parseBooleanFlag(req.query.includeHidden, false);
    if (!fs.existsSync(SAVES_DIR)) return res.json([]);
    const files = fs.readdirSync(SAVES_DIR).filter(f => f.endsWith('.json'));
    const saves = files.map(f => {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(SAVES_DIR, f), 'utf8'));
        return {
          sessionId: d.sessionId,
          startUrl: d.startUrl,
          startedAt: d.startedAt,
          lastSavedAt: d.lastSavedAt,
          status: d.status,
          pageCount: d.pages?.length || 0,
          options: d.options,
          uiVisible: getSaveUiVisible(d),
          initiatedBy: getSaveInitiator(d),
        };
      } catch { return null; }
    })
      .filter(Boolean)
      .filter((save) => includeHidden || save.uiVisible !== false)
      .sort((a, b) => new Date(b.lastSavedAt) - new Date(a.lastSavedAt));
    res.json(saves);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/saves/:id', (req, res) => {
  try {
    const save = loadSaveById(req.params.id);
    if (!save) return res.status(404).json({ error: 'Save not found' });
    res.json(save);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/saves/:id', (req, res) => {
  try {
    const file = path.join(SAVES_DIR, `${req.params.id}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Stop an active session
app.post('/api/scrape/:sessionId/stop', (req, res) => {
  const scraper = sessions.get(req.params.sessionId);
  if (scraper) {
    scraper.stop();
    res.json({ message: 'Session stopped' });
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

// Pause an active session
app.post('/api/scrape/:sessionId/pause', (req, res) => {
  const scraper = sessions.get(req.params.sessionId);
  if (scraper) { scraper.pause(); res.json({ message: 'Session paused' }); }
  else res.status(404).json({ error: 'Session not found' });
});

// Resume a paused session
app.post('/api/scrape/:sessionId/resume', (req, res) => {
  const scraper = sessions.get(req.params.sessionId);
  if (scraper) { scraper.resume(); res.json({ message: 'Session resumed' }); }
  else res.status(404).json({ error: 'Session not found' });
});

// Verification code submission during scrape
app.post('/api/scrape/:sessionId/verify', (req, res) => {
  const scraper = sessions.get(req.params.sessionId);
  if (scraper) {
    scraper.submitVerification(req.body.code);
    res.json({ message: 'Verification code submitted' });
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

// Credentials submission during scrape (when login wall auto-detected)
app.post('/api/scrape/:sessionId/credentials', (req, res) => {
  const scraper = sessions.get(req.params.sessionId);
  if (scraper) {
    scraper.submitCredentials(req.body.username, req.body.password);
    res.json({ message: 'Credentials submitted' });
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

// ---- Diff ----
app.post('/api/diff', (req, res) => {
  const { resultA, resultB } = req.body;
  if (!resultA || !resultB) {
    return res.status(400).json({ error: 'resultA and resultB are required' });
  }
  try {
    const diff = diffScrapes(resultA, resultB);
    res.json(diff);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Schedules ----
app.get('/api/schedules', (req, res) => {
  res.json(listSchedules());
});

app.post('/api/schedules', (req, res) => {
  const { cronExpr, scrapeOptions, label } = req.body || {};
  if (!cronExpr || typeof cronExpr !== 'string') return res.status(400).json({ error: `'cronExpr' must be a non-empty string` });
  if (!scrapeOptions || typeof scrapeOptions !== 'object') return res.status(400).json({ error: `'scrapeOptions' must be an object` });
  if (!scrapeOptions.url || typeof scrapeOptions.url !== 'string') return res.status(400).json({ error: `'scrapeOptions.url' is required` });
  try {
    const id = uuidv4();
    createSchedule(id, cronExpr, scrapeOptions, (result, err) => {
      if (err) console.error(`Schedule ${id} error:`, err.message);
    }, label || null);
    res.json({ id, message: 'Schedule created' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/schedules/:id', (req, res) => {
  const deleted = deleteSchedule(req.params.id);
  if (deleted) {
    res.json({ message: 'Schedule deleted' });
  } else {
    res.status(404).json({ error: 'Schedule not found' });
  }
});

// ---- Generators ----
app.post('/api/generate/react', (req, res) => {
  const { pageData } = req.body;
  if (!pageData) return res.status(400).json({ error: 'pageData is required' });
  try {
    const jsx = generateReact(pageData);
    res.json({ jsx });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/generate/css', (req, res) => {
  const { pageData } = req.body;
  if (!pageData) return res.status(400).json({ error: 'pageData is required' });
  try {
    const css = extractCSS(pageData);
    res.json({ css });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/generate/markdown', (req, res) => {
  const { pageData } = req.body;
  if (!pageData) return res.status(400).json({ error: 'pageData is required' });
  try {
    const markdown = generateMarkdown(pageData);
    res.json({ markdown });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/generate/sitemap', (req, res) => {
  const { pages } = req.body || {};
  if (!Array.isArray(pages) || pages.length === 0) return res.status(400).json({ error: `'pages' must be a non-empty array` });
  try {
    const xml = generateSitemap(pages);
    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- AI assistant ----
app.post('/api/ai/chat', async (req, res) => {
  const {
    source = 'current',
    question,
    mode = 'auto',
    includeEvidence = false,
    url,
    scrapeData,
    maxPages = 3,
    scrapeDepth = 1,
    autoScroll = false,
  } = req.body || {};

  const trimmedQuestion = String(question || '').trim();
  if (!trimmedQuestion) {
    return res.status(400).json({ error: 'question is required' });
  }

  try {
    if (source === 'url') {
      const targetUrl = String(url || '').trim();
      if (!targetUrl) return res.status(400).json({ error: 'url is required when source is "url"' });

      const startedAt = Date.now();
      const toolResult = await handleMcpTool('research_url', {
        url: targetUrl,
        question: trimmedQuestion,
        mode,
        includeEvidence: !!includeEvidence,
        maxPages: Number(maxPages) || 3,
        scrapeDepth: Number(scrapeDepth) || 1,
        autoScroll: !!autoScroll,
      });
      const data = unwrapMcpToolResult(toolResult);
      return res.json({
        source: 'url',
        question: trimmedQuestion,
        requestedUrl: targetUrl,
        ...data,
        timings: {
          ...(data.timings || {}),
          totalMs: Date.now() - startedAt,
        },
      });
    }

    if (!scrapeData || typeof scrapeData !== 'object') {
      return res.status(400).json({ error: 'scrapeData is required when source is "current"' });
    }

    const { normalized, pages } = buildAiCurrentSourcePayload(scrapeData);
    if (!pages.length) {
      return res.status(400).json({ error: 'No page text is available in the current scrape data yet' });
    }

    const startedAt = Date.now();
    const analysis = await analyzeResearchQuestion(pages, trimmedQuestion, {
      mode,
      includeEvidence: !!includeEvidence,
    });

    return res.json({
      source: 'current',
      question: trimmedQuestion,
      startUrl: normalized?.startUrl || normalized?.siteInfo?.origin || '',
      pageCount: Array.isArray(normalized?.pages) ? normalized.pages.length : 0,
      routeUsed: analysis.routeUsed,
      modelUsed: analysis.modelUsed,
      answer: analysis.answer,
      findings: analysis.findings || [],
      confidence: analysis.confidence || 'medium',
      suggestedFollowUp: analysis.suggestedFollowUp || [],
      ...(includeEvidence ? { evidence: analysis.evidence || [] } : {}),
      timings: {
        analysisMs: Date.now() - startedAt,
      },
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message,
      code: err.code || 'ai_failed',
      retryable: !!err.retryable,
      suggestedNextStep: err.suggestedNextStep || 'Try again with a smaller scope or switch modes.',
    });
  }
});

// ---- Schema inference ----
app.post('/api/schema', (req, res) => {
  const { graphqlCalls } = req.body;
  if (!graphqlCalls) return res.status(400).json({ error: 'graphqlCalls is required' });
  try {
    const schema = inferSchema(graphqlCalls);
    res.json(schema);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- TLS fingerprint analysis ----
app.post('/api/tls-fingerprint', async (req, res) => {
  const { compareProfile, targetHost, targetPort } = req.body || {};
  try {
    const result = await testTlsFingerprint({
      compareProfile: compareProfile || 'chrome-115',
      targetHost:     targetHost  || null,
      targetPort:     targetPort  || 443,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- OIDC security lab ----
app.post('/api/oidc-test', async (req, res) => {
  const {
    mockServerUrl, clientId, clientSecret, tests, validRedirectUri,
    pkceClientId, targetClientId, resourceIds, requestedScopes, allowedScopes,
    resourcePath, secureEndpointPath, vulnerableEndpointPath,
  } = req.body || {};
  if (!mockServerUrl) return res.status(400).json({ error: 'mockServerUrl is required' });
  if (!clientId)      return res.status(400).json({ error: 'clientId is required' });
  try {
    const results = await performOidcSecurityTests({
      mockServerUrl,
      clientId,
      clientSecret:     clientSecret     || null,
      testsToRun:       tests            || ['all'],
      validRedirectUri: validRedirectUri || null,
      pkceClientId:     pkceClientId     || null,
      targetClientId:   targetClientId   || null,
      resourceIds:      resourceIds      || null,
      requestedScopes:  requestedScopes  || null,
      allowedScopes:          allowedScopes          || null,
      resourcePath:           resourcePath           || null,
      secureEndpointPath:     secureEndpointPath     || null,
      vulnerableEndpointPath: vulnerableEndpointPath || null,
    });
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Screenshot ----
app.post('/api/screenshot', async (req, res) => {
  const { url, fullPage = false, waitMs = 1000 } = req.body || {};
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url is required' });

  const { chromium } = require('playwright-extra');
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (waitMs > 0) await page.waitForTimeout(waitMs);
    const vp = page.viewportSize();
    const buf = await page.screenshot({ type: 'png', fullPage: !!fullPage });
    await browser.close();
    browser = null;
    res.json({
      url,
      screenshotBase64: buf.toString('base64'),
      width: vp?.width || null,
      height: vp?.height || null,
      fullPage: !!fullPage,
      capturedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
});

// ---- Fill form ----
// Supports both single-step and multi-step (wizard) forms.
//
// Single-step (legacy, backwards-compatible):
//   { url, fields: [{selector, value}], submitSelector?, waitMs? }
//
// Multi-step wizard:
//   { url, steps: [
//       { fields: [{selector, value}], submitSelector?, waitForSelector?, waitMs? },
//       { fields: [...], submitSelector?, waitForSelector?, waitMs? },
//     ]
//   }
//   Each step fills its fields, optionally clicks a submit/next button,
//   then waits for a selector or a fixed delay before the next step.
//
app.post('/api/fill-form', async (req, res) => {
  const body = req.body || {};
  if (!body.url || typeof body.url !== 'string') return res.status(400).json({ error: 'url is required' });

  // Normalise: single-step → steps array
  let steps;
  if (Array.isArray(body.steps) && body.steps.length > 0) {
    steps = body.steps;
  } else if (Array.isArray(body.fields) && body.fields.length > 0) {
    steps = [{ fields: body.fields, submitSelector: body.submitSelector, waitMs: body.waitMs ?? 2000 }];
  } else {
    return res.status(400).json({ error: 'Provide either steps[] (multi-step) or fields[] (single-step)' });
  }

  const { chromium } = require('playwright-extra');
  const { extractPageData } = require('./extractor');
  let browser;
  const stepResults = [];

  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' });
    const page = await ctx.newPage();
    await page.goto(body.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    for (let si = 0; si < steps.length; si++) {
      const step = steps[si];
      if (!Array.isArray(step.fields) || step.fields.length === 0) {
        return res.status(400).json({ error: `steps[${si}].fields must be a non-empty array` });
      }

      // Fill all fields in this step
      for (const field of step.fields) {
        if (!field.selector || typeof field.selector !== 'string') {
          return res.status(400).json({ error: `steps[${si}]: each field needs a 'selector' string` });
        }
        const fillValue = String(field.value ?? '');
        try {
          // Primary: direct page.fill() — fast, reliable, triggers all input events
          await page.fill(field.selector, fillValue, { timeout: 8000 });
        } catch (fillErr) {
          try {
            // Fallback 1: locator (shadow DOM, nth-match)
            await page.locator(field.selector).first().fill(fillValue, { timeout: 8000 });
          } catch {
            // Fallback 2: type character-by-character (custom inputs, contenteditable)
            try { await page.locator(field.selector).first().type(fillValue, { timeout: 8000 }); } catch {}
          }
        }
      }

      // Submit / advance to next step
      if (step.submitSelector) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
          page.click(step.submitSelector),
        ]);
      } else if (si < steps.length - 1 || !step.skipEnter) {
        // Press Enter on the last filled field to advance
        const lastSelector = step.fields[step.fields.length - 1].selector;
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
          page.locator(lastSelector).first().press('Enter'),
        ]);
      }

      // Wait for a specific element to appear (signals step completion)
      if (step.waitForSelector) {
        await page.waitForSelector(step.waitForSelector, { timeout: 15000 }).catch(() => {});
      }

      const stepWaitMs = typeof step.waitMs === 'number' ? step.waitMs : 1500;
      if (stepWaitMs > 0) await page.waitForTimeout(stepWaitMs);

      const stepUrl = page.url();
      const stepData = await extractPageData(page, stepUrl, { lightMode: true });
      stepResults.push({
        step: si + 1,
        url: stepUrl,
        pageTitle: stepData.meta?.title || '',
        forms: (stepData.forms || []).slice(0, 5),
        fullText: (stepData.fullText || '').slice(0, 3000),
      });
    }

    const resultUrl = page.url();
    const finalData = await extractPageData(page, resultUrl, { lightMode: true });
    await browser.close();
    browser = null;

    res.json({
      url: body.url,
      resultUrl,
      stepsCompleted: steps.length,
      stepResults,
      pageTitle:  finalData.meta?.title || '',
      fullText:   (finalData.fullText || '').slice(0, 8000),
      links:      (finalData.links || []).slice(0, 50).map(l => ({ href: l.href, text: l.text })),
      forms:      (finalData.forms || []).slice(0, 10),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
});

// ---- Tool usage logs ----
app.get('/api/tool-logs', (req, res) => {
  const logPath = path.join(__dirname, '../logs/tool-usage.json');
  try {
    if (!fs.existsSync(logPath)) return res.json({ totalCalls: 0, tools: {} });
    const data = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Tool request log list ----
app.get('/api/tool-logs/requests', (req, res) => {
  const reqDir = path.join(__dirname, '../logs/requests');
  try {
    if (!fs.existsSync(reqDir)) return res.json([]);
    const today = new Date().toISOString().slice(0, 10);
    const dayDir = path.join(reqDir, today);
    if (!fs.existsSync(dayDir)) return res.json([]);
    const files = fs.readdirSync(dayDir)
      .filter(f => f.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a))
      .slice(0, 50);
    const requests = files.map(f => {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(dayDir, f), 'utf8'));
        return {
          tool: raw.tool,
          ts: raw.ts,
          durationMs: raw.durationMs,
          error: raw.error || null,
          id: raw.id,
        };
      } catch { return null; }
    }).filter(Boolean);
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── APA Live Scores proxy routes ─────────────────────────────────────────────
const apaGql = require('./apa-gql');
const ID_MAP_PATH = path.join(__dirname, '..', 'apps', 'apa', 'id_map.json');

const APA_TEAM_SCHEDULE_Q = `
query teamSchedule($id: Int!) {
  team(id: $id) {
    id
    matches(unscheduled: true) {
      id week type isBye status scoresheet startTime isMine isPaid isScored isFinalized
      isPlayoff description tableNumber
      results { homeAway points { total __typename } __typename }
      timeZone { id name __typename }
      location { id name address { id name __typename } __typename }
      home { id name number isMine __typename }
      away { id name number isMine __typename }
      division { id scheduleInEdit isTournament __typename }
      __typename
    }
    __typename
  }
}`;

const APA_MATCH_Q = `
query MatchPage($id: Int!) {
  match(id: $id) {
    id isFinalized isTournament tableNumber
    division { id electronicScoringEnabled type __typename }
    type startTime week isBye isMine isScored scoresheet
    home {
      id name number isMine
      division { id type __typename }
      roster {
        id memberNumber displayName matchesWon matchesPlayed
        ... on EightBallPlayer { pa ppm skillLevel __typename }
        ... on NineBallPlayer  { pa ppm skillLevel __typename }
        __typename
      }
      __typename
    }
    away {
      id name number isMine
      division { id type __typename }
      roster {
        id memberNumber displayName matchesWon matchesPlayed
        ... on EightBallPlayer { pa ppm skillLevel __typename }
        ... on NineBallPlayer  { pa ppm skillLevel __typename }
        __typename
      }
      __typename
    }
    division { id scheduleInEdit type __typename }
    session { id name year __typename }
    results {
      homeAway matchesWon matchesPlayed
      points { bonus penalty won adjustment sportsmanship total __typename }
      scores {
        id matchPositionNumber playerPosition skillLevel
        innings defensiveShots eightBallWins nineBallPoints
        winLoss matchForfeited teamSlot eightBallMatchPointsEarned
        player { id displayName __typename }
        __typename
      }
      __typename
    }
    __typename
  }
}`;

const APA_VIEWER_TEAMS_Q = `
query dashboard {
  viewer {
    ... on Member {
      teams {
        id name number
        division { id name format nightOfPlay number state __typename }
        session { id name __typename }
        league { id slug __typename }
        __typename
      }
      __typename
    }
    __typename
  }
}`;

const APA_ALIAS_STATS_Q = `
query AliasSessionStats($format: FormatType!, $id: Int!, $session: Int!) {
  alias(id: $id) {
    id
    displayName
    memberNumber
    ... on EightBallAlias {
      sessionStats(sessionId: $session) {
        matchesWon matchesPlayed pa ppm skillLevel
        eightOnBreaks eightBallBreakAndRuns rackless miniSlams
        __typename
      }
      __typename
    }
    ... on NineBallAlias {
      sessionStats(sessionId: $session) {
        matchesWon matchesPlayed pa ppm skillLevel
        nineOnSnaps nineBallBreakAndRuns miniSlams skunks
        __typename
      }
      __typename
    }
    __typename
  }
}`;

function loadIdMap() {
  try {
    if (fs.existsSync(ID_MAP_PATH)) return JSON.parse(fs.readFileSync(ID_MAP_PATH, 'utf8'));
  } catch {}
  return {};
}

function isTonightMatch(startTime) {
  if (!startTime) return false;
  try {
    const matchDate = new Date(startTime).toLocaleDateString('en-CA');
    const today     = new Date().toLocaleDateString('en-CA');
    return matchDate === today;
  } catch { return false; }
}

function isThisWeek(startTime) {
  if (!startTime) return false;
  try {
    const dt  = new Date(startTime);
    const now = new Date();
    const diffDays = (dt - now) / 86400000;
    return diffDays >= -2 && diffDays <= 7;
  } catch { return false; }
}

// Serve id_map.json
app.get('/api/apa/id-map', (req, res) => {
  try { res.json(loadIdMap()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Tonight's matches for all viewer teams (groups 8-ball + 9-ball by real team name)
app.get('/api/apa/tonight', async (req, res) => {
  try {
    const resp  = await apaGql.gql('dashboard', {}, APA_VIEWER_TEAMS_Q);
    const teams = resp?.data?.viewer?.teams || [];
    const idMap = loadIdMap();

    const results = [];
    for (const team of teams) {
      const schedResp = await apaGql.gql('teamSchedule', { id: team.id }, APA_TEAM_SCHEDULE_Q);
      const matches   = schedResp?.data?.team?.matches || [];
      const tonight   = matches.filter(m => !m.isBye && isTonightMatch(m.startTime));
      for (const m of tonight) {
        results.push({ team, match: m });
      }
    }

    // Group by real-world team (same name + session = same team, just different format)
    const groups = {};
    for (const { team, match } of results) {
      const key = `${team.name.toLowerCase()}_${team.session?.id}`;
      if (!groups[key]) groups[key] = { teamName: team.name, session: team.session, matches: [] };
      groups[key].matches.push({ format: team.division?.format || '', teamId: team.id, match });
    }

    res.json({ groups: Object.values(groups), raw: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// This week's matches
app.get('/api/apa/week', async (req, res) => {
  try {
    const resp  = await apaGql.gql('dashboard', {}, APA_VIEWER_TEAMS_Q);
    const teams = resp?.data?.viewer?.teams || [];

    const results = [];
    for (const team of teams) {
      const schedResp = await apaGql.gql('teamSchedule', { id: team.id }, APA_TEAM_SCHEDULE_Q);
      const matches   = schedResp?.data?.team?.matches || [];
      const week      = matches.filter(m => !m.isBye && isThisWeek(m.startTime));
      for (const m of week) {
        results.push({ team, match: m });
      }
    }
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Full match detail
app.get('/api/apa/match/:id', async (req, res) => {
  try {
    const id   = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid match id' });
    const resp = await apaGql.gql('MatchPage', { id }, APA_MATCH_Q);
    res.json(resp?.data?.match || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Team schedule
app.get('/api/apa/team/:id/schedule', async (req, res) => {
  try {
    const id   = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid team id' });
    const resp = await apaGql.gql('teamSchedule', { id }, APA_TEAM_SCHEDULE_Q);
    res.json(resp?.data?.team || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Web Scraper running at http://localhost:${PORT}`);
  gitAutosave.start();
});
