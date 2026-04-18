'use strict';

/**
 * tests/security/mock_idp.js
 * Extended mock OpenID Connect / OAuth2 / PingAccess-style server.
 * Uses only Node built-ins — no external dependencies.
 *
 * Endpoints:
 *   GET  /as/authorization.oauth2     — authorization code flow (PKCE-aware)
 *   POST /as/token.oauth2             — code exchange + refresh_token + client_credentials
 *   GET  /userinfo                    — JWT-protected resource
 *   GET  /resource/:id                — ownership-checked resource (BOLA testing)
 *   POST /resource                    — create a resource owned by authenticated client
 *   GET  /header-protected            — secure: ignores auth headers, JWT only
 *   GET  /header-vulnerable           — vulnerable: trusts X-Authenticated-User blindly
 *
 * Clients pre-registered:
 *   test-client   — no PKCE required, broad scopes, has refresh_token support
 *   pkce-client   — PKCE required (S256), public client (no secret)
 *   vendor-a      — for BOLA/IDOR testing (owns report-vendor-a)
 *   vendor-b      — for BOLA/IDOR testing (owns report-vendor-b)
 *   limited-scope — registered for ['openid','read'] only — scope escalation target
 */

const http   = require('http');
const crypto = require('crypto');

// ─── CLIENT REGISTRY ──────────────────────────────────────────────────────────

const CLIENTS = {
  'test-client': {
    secret:        'test-secret',
    redirect_uris: ['http://localhost:3000/callback'],
    requirePkce:   false,
    allowedScopes: ['openid', 'profile', 'email', 'read', 'write'],
  },
  'pkce-client': {
    secret:        null, // public client
    redirect_uris: ['http://localhost:3000/callback'],
    requirePkce:   true,
    allowedScopes: ['openid', 'profile'],
  },
  'vendor-a': {
    secret:        'vendor-a-secret',
    redirect_uris: ['http://localhost:3000/callback'],
    requirePkce:   false,
    allowedScopes: ['openid', 'read:reports'],
  },
  'vendor-b': {
    secret:        'vendor-b-secret',
    redirect_uris: ['http://localhost:3000/callback'],
    requirePkce:   false,
    allowedScopes: ['openid', 'read:reports'],
  },
  'limited-scope': {
    secret:        'limited-secret',
    redirect_uris: ['http://localhost:3000/callback'],
    requirePkce:   false,
    allowedScopes: ['openid', 'read'],
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
  const header = b64uEncode({ alg: 'HS256', typ: 'JWT' });
  const body   = b64uEncode(payload);
  const sig    = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyJwt(token, clients) {
  const parts = (token || '').split('.');
  if (parts.length !== 3) return null;

  const header = b64uDecode(parts[0]);
  if (!header || !header.alg || header.alg.toLowerCase() === 'none') return null;
  if (parts[2] === '') return null;

  for (const [id, client] of Object.entries(clients)) {
    if (!client.secret) continue;
    const expected = crypto
      .createHmac('sha256', client.secret)
      .update(`${parts[0]}.${parts[1]}`)
      .digest('base64url');
    try {
      if (crypto.timingSafeEqual(Buffer.from(parts[2]), Buffer.from(expected))) {
        return b64uDecode(parts[1]);
      }
    } catch { /* length mismatch — not this client */ }
  }
  return null;
}

// ─── PKCE HELPERS ─────────────────────────────────────────────────────────────

function verifyPkce(codeVerifier, storedChallenge, method) {
  if (method === 'S256') {
    const computed = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    return computed === storedChallenge;
  }
  if (method === 'plain') {
    return codeVerifier === storedChallenge;
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

function getBearerPayload(req, clients) {
  const auth  = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  return verifyJwt(token, clients);
}

// ─── SERVER FACTORY ───────────────────────────────────────────────────────────

function createServer() {
  // Per-instance state — no shared globals
  const authCodes     = new Map(); // code → { clientId, redirectUri, codeChallenge, codeChallengeMethod, scope, exp }
  const refreshTokens = new Map(); // token → { clientId, scope, used: false }
  const resources     = new Map(); // resourceId → { ownerId, data }

  // Pre-seed resources for BOLA testing
  resources.set('report-vendor-a', { ownerId: 'vendor-a', data: { revenue: 125000, units: 42 } });
  resources.set('report-vendor-b', { ownerId: 'vendor-b', data: { revenue: 98000,  units: 31 } });

  const server = http.createServer(async (req, res) => {
    const u        = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = u.pathname;
    const query    = Object.fromEntries(u.searchParams.entries());

    // ── GET /as/authorization.oauth2 ─────────────────────────────────────────
    if (req.method === 'GET' && pathname === '/as/authorization.oauth2') {
      const { client_id, redirect_uri, response_type, state, scope,
              code_challenge, code_challenge_method } = query;

      const client = CLIENTS[client_id];
      if (!client)
        return send(res, 400, { error: 'unknown_client' });

      if (!client.redirect_uris.includes(redirect_uri))
        return send(res, 400, { error: 'redirect_uri_mismatch', detail: redirect_uri });

      if (response_type !== 'code')
        return send(res, 400, { error: 'unsupported_response_type' });

      // PKCE enforcement
      if (client.requirePkce) {
        if (!code_challenge)
          return send(res, 400, { error: 'invalid_request', error_description: 'code_challenge required' });
        if (code_challenge_method !== 'S256')
          return send(res, 400, { error: 'invalid_request', error_description: 'code_challenge_method must be S256' });
      }

      const code = crypto.randomBytes(16).toString('hex');
      authCodes.set(code, {
        clientId:            client_id,
        redirectUri:         redirect_uri,
        codeChallenge:       code_challenge || null,
        codeChallengeMethod: code_challenge_method || null,
        scope:               scope || 'openid',
        exp:                 Date.now() + 60_000, // 1 minute
      });

      const dest = `${redirect_uri}?code=${code}&state=${encodeURIComponent(state || '')}`;
      res.writeHead(302, { Location: dest });
      return res.end();
    }

    // ── POST /as/token.oauth2 ─────────────────────────────────────────────────
    if (req.method === 'POST' && pathname === '/as/token.oauth2') {
      const body = await readBody(req);
      const { grant_type, client_id, client_secret, code, code_verifier,
              redirect_uri, refresh_token, scope } = body;

      const client = CLIENTS[client_id];
      if (!client)
        return send(res, 400, { error: 'invalid_client' });

      if (client.secret && client_secret !== client.secret)
        return send(res, 400, { error: 'invalid_client', detail: 'bad secret' });

      // ── authorization_code grant ──────────────────────────────────────────
      if (grant_type === 'authorization_code') {
        const stored = authCodes.get(code);
        if (!stored || stored.clientId !== client_id || stored.exp < Date.now())
          return send(res, 400, { error: 'invalid_grant', detail: 'unknown or expired code' });

        if (stored.redirectUri !== redirect_uri)
          return send(res, 400, { error: 'invalid_grant', detail: 'redirect_uri mismatch' });

        // PKCE verification
        if (stored.codeChallenge) {
          if (!code_verifier)
            return send(res, 400, { error: 'invalid_grant', detail: 'code_verifier required' });
          if (!verifyPkce(code_verifier, stored.codeChallenge, stored.codeChallengeMethod))
            return send(res, 400, { error: 'invalid_grant', detail: 'code_verifier mismatch' });
        }

        authCodes.delete(code); // single-use

        const grantedScope = (stored.scope || 'openid').split(' ')
          .filter(s => client.allowedScopes.includes(s)).join(' ');

        const now     = Math.floor(Date.now() / 1000);
        const payload = { sub: client_id, iss: 'mock-idp', iat: now, exp: now + 3600, scope: grantedScope };
        const token   = signJwt(payload, client.secret || 'public-client-secret');

        const rt = crypto.randomBytes(32).toString('hex');
        refreshTokens.set(rt, { clientId: client_id, scope: grantedScope, used: false });

        return send(res, 200, {
          access_token:  token,
          token_type:    'Bearer',
          expires_in:    3600,
          refresh_token: rt,
          scope:         grantedScope,
        });
      }

      // ── refresh_token grant ───────────────────────────────────────────────
      if (grant_type === 'refresh_token') {
        const stored = refreshTokens.get(refresh_token);
        if (!stored || stored.clientId !== client_id)
          return send(res, 400, { error: 'invalid_grant', detail: 'unknown refresh_token' });

        // Replay detection — token rotation
        if (stored.used) {
          // Compromise detected: invalidate entire family (simplified: just this token)
          refreshTokens.delete(refresh_token);
          return send(res, 400, { error: 'invalid_grant', detail: 'refresh_token already used — possible replay attack' });
        }

        stored.used = true; // mark consumed

        const now       = Math.floor(Date.now() / 1000);
        const payload   = { sub: client_id, iss: 'mock-idp', iat: now, exp: now + 3600, scope: stored.scope };
        const newToken  = signJwt(payload, client.secret || 'public-client-secret');
        const newRt     = crypto.randomBytes(32).toString('hex');
        refreshTokens.set(newRt, { clientId: client_id, scope: stored.scope, used: false });

        return send(res, 200, {
          access_token:  newToken,
          token_type:    'Bearer',
          expires_in:    3600,
          refresh_token: newRt, // rotated
          scope:         stored.scope,
        });
      }

      // ── client_credentials grant ──────────────────────────────────────────
      if (grant_type === 'client_credentials') {
        const requestedScopes = (scope || 'openid').split(' ');
        const grantedScope    = requestedScopes.filter(s => client.allowedScopes.includes(s)).join(' ') || 'openid';

        const now     = Math.floor(Date.now() / 1000);
        const payload = { sub: client_id, iss: 'mock-idp', iat: now, exp: now + 3600, scope: grantedScope };
        const token   = signJwt(payload, client.secret || 'public-client-secret');

        const rt = crypto.randomBytes(32).toString('hex');
        refreshTokens.set(rt, { clientId: client_id, scope: grantedScope, used: false });

        return send(res, 200, {
          access_token:  token,
          token_type:    'Bearer',
          expires_in:    3600,
          refresh_token: rt,
          scope:         grantedScope,
        });
      }

      return send(res, 400, { error: 'unsupported_grant_type' });
    }

    // ── GET /userinfo ─────────────────────────────────────────────────────────
    if (req.method === 'GET' && pathname === '/userinfo') {
      const payload = getBearerPayload(req, CLIENTS);
      if (!payload) return send(res, 401, { error: 'invalid_token' });
      return send(res, 200, { sub: payload.sub, scope: payload.scope });
    }

    // ── GET /resource/:id — BOLA target ──────────────────────────────────────
    if (req.method === 'GET' && pathname.startsWith('/resource/')) {
      const resourceId = pathname.split('/').pop();
      const payload    = getBearerPayload(req, CLIENTS);
      if (!payload) return send(res, 401, { error: 'invalid_token' });

      const resource = resources.get(resourceId);
      if (!resource) return send(res, 404, { error: 'not_found' });

      if (resource.ownerId !== payload.sub)
        return send(res, 403, { error: 'forbidden', detail: `Resource owned by ${resource.ownerId}` });

      return send(res, 200, { resourceId, ownerId: resource.ownerId, data: resource.data });
    }

    // ── POST /resource — create owned resource ────────────────────────────────
    if (req.method === 'POST' && pathname === '/resource') {
      const payload = getBearerPayload(req, CLIENTS);
      if (!payload) return send(res, 401, { error: 'invalid_token' });

      const resourceId = `resource-${crypto.randomBytes(8).toString('hex')}`;
      resources.set(resourceId, { ownerId: payload.sub, data: { created: Date.now() } });
      return send(res, 201, { resourceId, ownerId: payload.sub });
    }

    // ── GET /header-protected — SECURE: JWT only, ignores auth headers ────────
    if (req.method === 'GET' && pathname === '/header-protected') {
      const payload = getBearerPayload(req, CLIENTS);
      if (!payload)
        return send(res, 401, { error: 'unauthorized', detail: 'valid Bearer token required' });
      return send(res, 200, { authn: 'jwt', sub: payload.sub, scope: payload.scope });
    }

    // ── GET /header-vulnerable — INSECURE: trusts X-Authenticated-User ───────
    // This endpoint simulates a misconfigured PingAccess backend that blindly
    // trusts upstream identity headers without verifying the JWT.
    if (req.method === 'GET' && pathname === '/header-vulnerable') {
      const injectedUser = req.headers['x-authenticated-user']
                        || req.headers['x-forwarded-user']
                        || req.headers['x-remote-user']
                        || req.headers['x-pingaccess-authenticated-user'];

      if (injectedUser) {
        // Vulnerable: grants access based on header alone
        return send(res, 200, {
          authn:    'header-injection',
          sub:      injectedUser,
          warning:  'VULNERABLE: access granted via injected header — no JWT verification',
        });
      }

      // Falls back to JWT if no injection header present
      const payload = getBearerPayload(req, CLIENTS);
      if (!payload)
        return send(res, 401, { error: 'unauthorized' });
      return send(res, 200, { authn: 'jwt', sub: payload.sub });
    }

    send(res, 404, { error: 'not_found', path: pathname });
  });

  return server;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const PORT = parseInt(process.env.MOCK_IDP_PORT || '9999', 10);
  const srv  = createServer();
  srv.listen(PORT, () => {
    console.log(`Mock IdP running at http://localhost:${PORT}`);
    console.log('Endpoints:');
    ['GET  /as/authorization.oauth2  — auth code flow (PKCE-aware)',
     'POST /as/token.oauth2          — code/refresh/client_credentials grant',
     'GET  /userinfo                 — JWT-protected',
     'GET  /resource/:id             — ownership check (BOLA test target)',
     'POST /resource                 — create owned resource',
     'GET  /header-protected         — secure: JWT only',
     'GET  /header-vulnerable        — INSECURE: trusts X-Authenticated-User',
    ].forEach(e => console.log(`  ${e}`));
    console.log(`\nClients: ${Object.keys(CLIENTS).join(', ')}`);
  });
}

module.exports = { createServer, CLIENTS };
