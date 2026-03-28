const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const ScraperSession = require('./scraper');
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
    clickSequence,
    autoScroll,
  } = req.body;

  if (!url && (!urls || urls.length === 0)) {
    return res.status(400).json({ error: 'URL is required' });
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
      username,
      password,
      verificationType,
      verificationCode,
      scrapeDepth: scrapeDepth || 1,
      captureGraphQL: captureGraphQL !== false,
      captureREST: captureREST !== false,
      captureAssets: captureAssets || false,
      clickSequence: clickSequence || [],
      autoScroll: autoScroll || false,
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

// Life RPG API (preserved)
try {
  const rpgRoutes = require('./rpg/routes');
  app.use('/api/rpg', rpgRoutes);
} catch {}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Web Scraper running at http://localhost:${PORT}`);
});
