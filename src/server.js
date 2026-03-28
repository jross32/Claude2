require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const ScraperSession = require('./scraper');
const { clearSession } = require('./scraper');
const { exportHAR } = require('./har-exporter');
const { inferSchema } = require('./schema-inferrer');
const { diffScrapes } = require('./diff');
const { createSchedule, deleteSchedule, listSchedules } = require('./scheduler');
const { generateReact, extractCSS, generateMarkdown, generateSitemap } = require('./generators');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// Active scraping sessions
const sessions = new Map();

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

  let origin;
  try { origin = new URL(rawUrl).origin; } catch { return res.status(400).send('bad url'); }

  // Try /favicon.ico first, then /apple-touch-icon.png
  const candidates = [`${origin}/favicon.ico`, `${origin}/apple-touch-icon.png`];
  for (const candidate of candidates) {
    try {
      const { buf, ct } = await fetchBytes(candidate);
      if (buf.length > 0) {
        res.set('Content-Type', ct || 'image/x-icon');
        res.set('Cache-Control', 'public, max-age=86400');
        return res.send(buf);
      }
    } catch {}
  }

  // Redirect to Google as last resort
  res.redirect(`https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(new URL(rawUrl).hostname)}`);
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

    const body = await new Promise((resolve, reject) => {
      const mod = parsed.protocol === 'https:' ? https : http;
      const req2 = mod.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } }, (r) => {
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

    res.json({ title, favicon, url, description });
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
    captureAllRequests,
    captureImages,
    imageLimit,
    clickSequence,
    autoScroll,
    showBrowser,
    slowMotion,
    fullCrawl,
    maxPages,
  } = req.body;

  if (!url && (!urls || urls.length === 0)) {
    return res.status(400).json({ error: 'URL is required' });
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
  sessions.set(sessionId, scraper);

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
      captureAllRequests: captureAllRequests || false,
      captureImages: captureImages || false,
      imageLimit: imageLimit !== undefined ? parseInt(imageLimit, 10) : 0,
      clickSequence: clickSequence || [],
      autoScroll: autoScroll || false,
      showBrowser: showBrowser || false,
      slowMotion: slowMotion || 0,
      fullCrawl: fullCrawl || false,
      maxPages: maxPages || 100,
    })
    .then((result) => {
      // Auto-attach HAR to result
      try { result.har = exportHAR(result); } catch {}
      broadcast(sessionId, { type: 'complete', data: result });
      sessions.delete(sessionId);
    })
    .catch((err) => {
      broadcast(sessionId, { type: 'error', message: err.message });
      sessions.delete(sessionId);
    });
});

// Stop an active session
app.post('/api/scrape/:sessionId/stop', (req, res) => {
  const scraper = sessions.get(req.params.sessionId);
  if (scraper) {
    scraper.stop();
    sessions.delete(req.params.sessionId);
    res.json({ message: 'Session stopped' });
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
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
  const { cronExpr, scrapeOptions } = req.body;
  if (!cronExpr || !scrapeOptions) {
    return res.status(400).json({ error: 'cronExpr and scrapeOptions are required' });
  }
  try {
    const id = uuidv4();
    createSchedule(id, cronExpr, scrapeOptions, (result, err) => {
      if (err) console.error(`Schedule ${id} error:`, err.message);
    });
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
  const { pages } = req.body;
  if (!pages) return res.status(400).json({ error: 'pages is required' });
  try {
    const xml = generateSitemap(pages);
    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    res.status(500).json({ error: err.message });
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Web Scraper running at http://localhost:${PORT}`);
});
