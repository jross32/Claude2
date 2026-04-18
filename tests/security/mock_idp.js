'use strict';

/**
 * tests/security/mock_idp.js
 * Minimal mock OpenID Connect / OAuth2 authorization server.
 * Uses only Node built-ins — no external dependencies.
 *
 * Endpoints:
 *   GET  /as/authorization.oauth2   — authorization code flow
 *   POST /as/token.oauth2           — client_credentials token exchange
 *   GET  /userinfo                  — protected resource (validates JWT)
 *
 * Usage (standalone):
 *   node tests/security/mock_idp.js          # listens on :9999
 *   MOCK_IDP_PORT=8888 node mock_idp.js
 *
 * Usage (programmatic):
 *   const { createServer, CLIENTS } = require('./mock_idp');
 *   const srv = createServer();
 *   srv.listen(0, () => { ... srv.address().port ... });
 */

const http   = require('http');
const crypto = require('crypto');
const urlMod = require('url'); // used only for pathname/query parsing on incoming requests

// ─── CLIENT REGISTRY ──────────────────────────────────────────────────────────

const CLIENTS = {
  'test-client': {
    secret:        'test-secret',
    redirect_uris: ['http://localhost:3000/callback'],
  },
};

// ─── JWT HELPERS ──────────────────────────────────────────────────────────────

function b64uEncode(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function b64uDecode(s) {
  try { return JSON.parse(Buffer.from(s, 'base64url').toString()); }
  catch { return null; }
}

function signJwt(payload, secret) {
  const header  = b64uEncode({ alg: 'HS256', typ: 'JWT' });
  const body    = b64uEncode(payload);
  const sig     = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

/**
 * Returns true only for a properly signed HS256 token.
 * Explicitly rejects alg:none and empty signatures.
 */
function verifyJwt(token) {
  const parts = (token || '').split('.');
  if (parts.length !== 3) return false;

  const header = b64uDecode(parts[0]);
  if (!header || !header.alg || header.alg.toLowerCase() === 'none') return false;
  if (parts[2] === '') return false; // empty sig = alg:none attempt

  for (const client of Object.values(CLIENTS)) {
    const expected = crypto
      .createHmac('sha256', client.secret)
      .update(`${parts[0]}.${parts[1]}`)
      .digest('base64url');
    try {
      if (crypto.timingSafeEqual(Buffer.from(parts[2]), Buffer.from(expected))) return true;
    } catch {
      // length mismatch from timingSafeEqual — not a match
    }
  }
  return false;
}

// ─── HTTP UTILS ───────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      const params = new URLSearchParams(data);
      const obj = {};
      for (const [k, v] of params) obj[k] = v;
      resolve(obj);
    });
  });
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type':   'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

// ─── SERVER FACTORY ───────────────────────────────────────────────────────────

function createServer() {
  const server = http.createServer(async (req, res) => {
    const u        = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = u.pathname;
    const query    = Object.fromEntries(u.searchParams.entries());

    // ── GET /as/authorization.oauth2 ──────────────────────────────────────────
    if (req.method === 'GET' && pathname === '/as/authorization.oauth2') {
      const { client_id, redirect_uri, response_type, state } = query;

      const client = CLIENTS[client_id];
      if (!client)
        return send(res, 400, { error: 'unknown_client' });

      if (!client.redirect_uris.includes(redirect_uri))
        return send(res, 400, { error: 'redirect_uri_mismatch', detail: redirect_uri });

      if (response_type !== 'code')
        return send(res, 400, { error: 'unsupported_response_type' });

      const code = crypto.randomBytes(16).toString('hex');
      const dest = `${redirect_uri}?code=${code}&state=${encodeURIComponent(state || '')}`;
      res.writeHead(302, { Location: dest });
      return res.end();
    }

    // ── POST /as/token.oauth2 ─────────────────────────────────────────────────
    if (req.method === 'POST' && pathname === '/as/token.oauth2') {
      const body = await readBody(req);
      const { grant_type, client_id, client_secret } = body;

      const client = CLIENTS[client_id];
      if (!client)
        return send(res, 400, { error: 'invalid_client' });

      if (client.secret && client_secret !== client.secret)
        return send(res, 400, { error: 'invalid_client', detail: 'bad secret' });

      if (grant_type !== 'client_credentials')
        return send(res, 400, { error: 'unsupported_grant_type' });

      const now = Math.floor(Date.now() / 1000);
      const payload = { sub: client_id, iss: 'mock-idp', iat: now, exp: now + 3600, scope: 'openid' };
      const token   = signJwt(payload, client.secret);

      return send(res, 200, { access_token: token, token_type: 'Bearer', expires_in: 3600 });
    }

    // ── GET /userinfo ─────────────────────────────────────────────────────────
    if (req.method === 'GET' && pathname === '/userinfo') {
      const auth  = req.headers.authorization || '';
      const token = auth.replace(/^Bearer\s+/i, '');

      if (!token)
        return send(res, 401, { error: 'invalid_token', detail: 'no token' });

      if (!verifyJwt(token))
        return send(res, 401, { error: 'invalid_token', detail: 'signature verification failed or alg:none rejected' });

      const parts   = token.split('.');
      const payload = b64uDecode(parts[1]);
      return send(res, 200, { sub: payload?.sub, scope: payload?.scope });
    }

    send(res, 404, { error: 'not_found' });
  });

  return server;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const PORT = parseInt(process.env.MOCK_IDP_PORT || '9999', 10);
  const srv  = createServer();
  srv.listen(PORT, () => {
    console.log(`Mock IdP running at http://localhost:${PORT}`);
    console.log(`  GET  /as/authorization.oauth2`);
    console.log(`  POST /as/token.oauth2`);
    console.log(`  GET  /userinfo`);
    console.log(`\nRegistered clients: ${Object.keys(CLIENTS).join(', ')}`);
  });
}

module.exports = { createServer, CLIENTS };
