const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const ScraperSession = require('./scraper');

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

// Start a new scrape
app.post('/api/scrape', async (req, res) => {
  const {
    url,
    hasAuth,
    username,
    password,
    verificationType,
    verificationCode,
    scrapeDepth,
    captureGraphQL,
    captureREST,
    captureAssets,
  } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const sessionId = uuidv4();
  res.json({ sessionId, message: 'Scraping started' });

  // Run scraper asynchronously
  const scraper = new ScraperSession(sessionId, broadcast);
  sessions.set(sessionId, scraper);

  scraper
    .run({
      url,
      hasAuth,
      username,
      password,
      verificationType,
      verificationCode,
      scrapeDepth: scrapeDepth || 1,
      captureGraphQL: captureGraphQL !== false,
      captureREST: captureREST !== false,
      captureAssets: captureAssets || false,
    })
    .then((result) => {
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

// Life RPG API
const rpgRoutes = require('./rpg/routes');
app.use('/api/rpg', rpgRoutes);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Web Scraper running at http://localhost:${PORT}`);
  console.log(`Life RPG at http://localhost:${PORT}/rpg`);
});
