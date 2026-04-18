'use strict';

/**
 * tests/security/mock_pingfederate.js
 *
 * Realistic local mock of a PingFederate + PingAccess deployment.
 * Mirrors the actual endpoint paths, error formats, header conventions,
 * and token structure used by PingFed — so security tooling can be
 * fully validated before use in an authorized engagement.
 *
 * What's realistic:
 *   - PingFederate endpoint paths  (/as/authorization.oauth2, /as/token.oauth2, /idp/userinfo.openid)
 *   - PingFederate error page body format  { code, message, details }
 *   - PA_-prefixed client IDs
 *   - PingAccess identity headers  (X-PingAccess-Authenticated-User etc.)
 *   - Vendor-scoped JWT claims (iss, sub, vendor_id, scope)
 *   - WWW-Authenticate header on 401s
 *   - Token introspection endpoint  (/as/introspect.oauth2)
 *   - PKCE enforcement per-client
 *   - Refresh token rotation
 *   - Resource ownership (BOLA target)
 *   - Scope registry per client
 *
 * Pre-registered clients:
 *   PA_VENDOR_PORTAL   — PKCE required, vendor-scoped (mirrors typical retail-link style)
 *   PA_LEGACY_VENDOR   — no PKCE (legacy B2B client, intentionally weaker)
 *   PA_VENDOR_A        — owns vendor-a reports
 *   PA_VENDOR_B        — owns vendor-b reports
 *   PA_LIMITED         — read-only scope (scope escalation target)
 *
 * Run standalone:
 *   node tests/security/mock_pingfederate.js
 *   PFED_PORT=9000 node tests/security/mock_pingfederate.js
 */

const http   = require('http');
const crypto = require('crypto');

// ─── CLIENT REGISTRY ──────────────────────────────────────────────────────────

const CLIENTS = {
  'PA_VENDOR_PORTAL': {
    secret:        null,                             // public client
    redirect_uris: ['https://vendor.local/auth/callback'],
    requirePkce:   true,
    allowedScopes: ['openid', 'profile', 'vendor:read', 'vendor:inventory'],
    vendorId:      'PORTAL',
  },
  'PA_LEGACY_VENDOR': {
    secret:        'legacy-secret-changeme',
    redirect_uris: ['https://vendor.local/auth/callback'],
    requirePkce:   false,                            // intentionally weaker — audit target
    allowedScopes: ['openid', 'vendor:read'],
    vendorId:      'LEGACY',
  },
  'PA_VENDOR_A': {
    secret:        'vendor-a-secret',
    redirect_uris: ['https://vendor.local/auth/callback'],
    requirePkce:   false,
    allowedScopes: ['openid', 'vendor:read', 'vendor:reports'],
    vendorId:      'VENDOR_A',
  },
  'PA_VENDOR_B': {
    secret:        'vendor-b-secret',
    redirect_uris: ['https://vendor.local/auth/callback'],
    requirePkce:   false,
    allowedScopes: ['openid', 'vendor:read', 'vendor:reports'],
    vendorId:      'VENDOR_B',
  },
  'PA_LIMITED': {
    secret:        'limited-secret',
    redirect_uris: ['https://vendor.local/auth/callback'],
    requirePkce:   false,
    allowedScopes: ['openid', 'vendor:read'],
    vendorId:      'LIMITED',
  },
};

// ─── PINGFEDERATE ERROR FORMAT ────────────────────────────────────────────────
// PingFed returns errors as JSON with { code, message, details }
// and sets X-PingFederate-Error: true

function pfedError(res, status, code, message, details = null) {
  const body = JSON.stringify({ code, message, ...(details ? { details } : {}) });
  res.writeHead(status, {
    'Content-Type':        'application/json',
    'Content-Length':      Buffer.byteLength(body),
    'X-PingFederate-Error': 'true',
  });
  res.end(body);
}

function pfedOk(res, status, body, extraHeaders = {}) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type':  'application/json',
    'Content-Length': Buffer.byteLength(json),
    'X-PingFederate': '10.3',
    ...extraHeaders,
  });
  res.end(json);
}

function pfedRedirect(res, location) {
  res.writeHead(302, {
    'Location':       location,
    'X-PingFederate': '10.3',
  });
  res.end();
}

// ─── JWT ──────────────────────────────────────────────────────────────────────

function b64u(obj) { return Buffer.from(JSON.stringify(obj)).toString('base64url'); }
function unb64u(s) {
  try { return JSON.parse(Buffer.from(s, 'base64url').toString()); }
  catch { return null; }
}

function signJwt(payload, secret) {
  const h   = b64u({ alg: 'RS256', typ: 'JWT', kid: 'pfed-signing-key-1' }); // PingFed uses RS256 in practice; we simulate with HS256 internally
  const p   = b64u(payload);
  const sig = crypto.createHmac('sha256', secret || 'pfed-internal-key').update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}

function verifyJwt(token) {
  const parts = (token || '').split('.');
  if (parts.length !== 3) return null;
  const header = unb64u(parts[0]);
  if (!header || header.alg?.toLowerCase() === 'none') return null;
  if (!parts[2]) return null;
  for (const client of Object.values(CLIENTS)) {
    const secret = client.secret || 'pfed-internal-key';
    const expected = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest('base64url');
    try {
      if (crypto.timingSafeEqual(Buffer.from(parts[2]), Buffer.from(expected))) return unb64u(parts[1]);
    } catch { /* length mismatch */ }
  }
  // Also try internal key (for public clients)
  const expected = crypto.createHmac('sha256', 'pfed-internal-key').update(`${parts[0]}.${parts[1]}`).digest('base64url');
  try {
    if (crypto.timingSafeEqual(Buffer.from(parts[2]), Buffer.from(expected))) return unb64u(parts[1]);
  } catch { /* no match */ }
  return null;
}

// ─── PKCE ─────────────────────────────────────────────────────────────────────

function verifyS256(verifier, challenge) {
  return crypto.createHash('sha256').update(verifier).digest('base64url') === challenge;
}

// ─── HTTP UTILS ───────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise(resolve => {
    let d = '';
    req.on('data', c => { d += c; });
    req.on('end', () => {
      const p = new URLSearchParams(d);
      const o = {};
      for (const [k, v] of p) o[k] = v;
      resolve(o);
    });
  });
}

function bearerPayload(req) {
  const auth  = req.headers['authorization'] || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  return token ? verifyJwt(token) : null;
}

// ─── SERVER FACTORY ───────────────────────────────────────────────────────────

function createServer() {
  const authCodes     = new Map(); // code → { clientId, redirectUri, codeChallenge, scope, exp }
  const refreshTokens = new Map(); // rt → { clientId, scope, used }
  const resources     = new Map(); // id → { ownerId, data }
  const introspectDb  = new Map(); // access_token → payload (for introspection)

  // Pre-seed resources
  resources.set('rpt-vendor-a-weekly', { ownerId: 'PA_VENDOR_A', data: { week: '2026-W15', units: 412, revenue: 18240 } });
  resources.set('rpt-vendor-b-weekly', { ownerId: 'PA_VENDOR_B', data: { week: '2026-W15', units: 319, revenue: 14110 } });

  const srv = http.createServer(async (req, res) => {
    const u        = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = u.pathname;
    const query    = Object.fromEntries(u.searchParams.entries());

    // ── GET /as/authorization.oauth2 (PingFederate path) ─────────────────────
    if (req.method === 'GET' && pathname === '/as/authorization.oauth2') {
      const { client_id, redirect_uri, response_type, state, scope,
              code_challenge, code_challenge_method, nonce } = query;

      const client = CLIENTS[client_id];
      if (!client)
        return pfedError(res, 400, 'OIDC_ERROR', 'Unknown client', `client_id '${client_id}' is not registered`);

      if (!client.redirect_uris.includes(redirect_uri))
        return pfedError(res, 400, 'INVALID_REDIRECT_URI', 'redirect_uri not whitelisted', redirect_uri);

      if (response_type !== 'code')
        return pfedError(res, 400, 'UNSUPPORTED_RESPONSE_TYPE', `response_type '${response_type}' not supported`);

      if (client.requirePkce) {
        if (!code_challenge)
          return pfedError(res, 400, 'PKCE_REQUIRED', 'code_challenge is required for this client');
        if (code_challenge_method !== 'S256')
          return pfedError(res, 400, 'PKCE_METHOD_UNSUPPORTED', 'Only S256 code_challenge_method is supported');
      }

      const code = crypto.randomBytes(20).toString('hex');
      authCodes.set(code, {
        clientId:            client_id,
        redirectUri:         redirect_uri,
        codeChallenge:       code_challenge || null,
        codeChallengeMethod: code_challenge_method || null,
        scope:               scope || 'openid',
        nonce:               nonce || null,
        exp:                 Date.now() + 60_000,
      });

      const dest = `${redirect_uri}?code=${code}&state=${encodeURIComponent(state || '')}`;
      return pfedRedirect(res, dest);
    }

    // ── POST /as/token.oauth2 ─────────────────────────────────────────────────
    if (req.method === 'POST' && pathname === '/as/token.oauth2') {
      const body = await readBody(req);
      const { grant_type, client_id, client_secret, code, code_verifier,
              redirect_uri, refresh_token, scope } = body;

      const client = CLIENTS[client_id];
      if (!client)
        return pfedError(res, 401, 'INVALID_CLIENT', 'Client authentication failed');

      if (client.secret && client_secret !== client.secret)
        return pfedError(res, 401, 'INVALID_CLIENT', 'Client authentication failed — invalid secret');

      // ── authorization_code ────────────────────────────────────────────────
      if (grant_type === 'authorization_code') {
        const stored = authCodes.get(code);
        if (!stored || stored.clientId !== client_id || stored.exp < Date.now()) {
          authCodes.delete(code);
          return pfedError(res, 400, 'INVALID_GRANT', 'Authorization code invalid or expired');
        }
        if (stored.redirectUri !== redirect_uri)
          return pfedError(res, 400, 'INVALID_GRANT', 'redirect_uri mismatch');

        if (stored.codeChallenge) {
          if (!code_verifier)
            return pfedError(res, 400, 'INVALID_GRANT', 'code_verifier required');
          if (!verifyS256(code_verifier, stored.codeChallenge))
            return pfedError(res, 400, 'INVALID_GRANT', 'PKCE verification failed');
        }

        authCodes.delete(code);

        const granted = (stored.scope || 'openid').split(' ')
          .filter(s => client.allowedScopes.includes(s)).join(' ');

        const now = Math.floor(Date.now() / 1000);
        const payload = {
          iss:       'https://pfed.local/as',
          sub:       client_id,
          aud:       client_id,
          iat:       now,
          exp:       now + 3600,
          scope:     granted,
          vendor_id: client.vendorId,
          nonce:     stored.nonce,
          token_use: 'access',
        };
        const secret = client.secret || 'pfed-internal-key';
        const token  = signJwt(payload, secret);
        const rt     = crypto.randomBytes(32).toString('hex');
        refreshTokens.set(rt, { clientId: client_id, scope: granted, used: false });
        introspectDb.set(token, payload);

        return pfedOk(res, 200, {
          access_token:  token,
          token_type:    'Bearer',
          expires_in:    3600,
          refresh_token: rt,
          scope:         granted,
          id_token:      signJwt({ ...payload, token_use: 'id' }, secret),
        });
      }

      // ── refresh_token ─────────────────────────────────────────────────────
      if (grant_type === 'refresh_token') {
        const stored = refreshTokens.get(refresh_token);
        if (!stored || stored.clientId !== client_id)
          return pfedError(res, 400, 'INVALID_GRANT', 'refresh_token not found or does not belong to this client');

        if (stored.used) {
          refreshTokens.delete(refresh_token);
          return pfedError(res, 400, 'INVALID_GRANT', 'refresh_token already used — session invalidated (possible replay attack)');
        }

        stored.used = true;

        const now    = Math.floor(Date.now() / 1000);
        const payload = {
          iss: 'https://pfed.local/as', sub: client_id, aud: client_id,
          iat: now, exp: now + 3600, scope: stored.scope,
          vendor_id: CLIENTS[client_id]?.vendorId, token_use: 'access',
        };
        const secret   = CLIENTS[client_id]?.secret || 'pfed-internal-key';
        const newToken = signJwt(payload, secret);
        const newRt    = crypto.randomBytes(32).toString('hex');
        refreshTokens.set(newRt, { clientId: client_id, scope: stored.scope, used: false });
        introspectDb.set(newToken, payload);

        return pfedOk(res, 200, {
          access_token:  newToken,
          token_type:    'Bearer',
          expires_in:    3600,
          refresh_token: newRt,
          scope:         stored.scope,
        });
      }

      // ── client_credentials ────────────────────────────────────────────────
      if (grant_type === 'client_credentials') {
        const requested = (scope || 'openid').split(' ');
        const granted   = requested.filter(s => client.allowedScopes.includes(s)).join(' ') || 'openid';
        const now       = Math.floor(Date.now() / 1000);
        const payload   = {
          iss: 'https://pfed.local/as', sub: client_id, aud: client_id,
          iat: now, exp: now + 3600, scope: granted,
          vendor_id: client.vendorId, token_use: 'access',
        };
        const secret = client.secret || 'pfed-internal-key';
        const token  = signJwt(payload, secret);
        const rt     = crypto.randomBytes(32).toString('hex');
        refreshTokens.set(rt, { clientId: client_id, scope: granted, used: false });
        introspectDb.set(token, payload);

        return pfedOk(res, 200, {
          access_token:  token,
          token_type:    'Bearer',
          expires_in:    3600,
          refresh_token: rt,
          scope:         granted,
        });
      }

      return pfedError(res, 400, 'UNSUPPORTED_GRANT_TYPE', `grant_type '${grant_type}' not supported`);
    }

    // ── GET /userinfo — alias for oidc-tester compatibility ──────────────────
    if (req.method === 'GET' && pathname === '/userinfo') {
      const payload = bearerPayload(req);
      if (!payload) {
        res.writeHead(401, { 'WWW-Authenticate': 'Bearer realm="pfed.local"', 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ code: 'INVALID_TOKEN', message: 'Bearer token missing or invalid' }));
      }
      return pfedOk(res, 200, { sub: payload.sub, vendor_id: payload.vendor_id, scope: payload.scope });
    }

    // ── GET /idp/userinfo.openid (PingFederate userinfo path) ─────────────────
    if (req.method === 'GET' && pathname === '/idp/userinfo.openid') {
      const payload = bearerPayload(req);
      if (!payload) {
        res.writeHead(401, {
          'WWW-Authenticate': 'Bearer realm="pfed.local", error="invalid_token"',
          'Content-Type':     'application/json',
        });
        return res.end(JSON.stringify({ code: 'INVALID_TOKEN', message: 'Bearer token missing or invalid' }));
      }
      return pfedOk(res, 200, {
        sub:       payload.sub,
        vendor_id: payload.vendor_id,
        scope:     payload.scope,
        iss:       payload.iss,
      });
    }

    // ── POST /as/introspect.oauth2 ────────────────────────────────────────────
    if (req.method === 'POST' && pathname === '/as/introspect.oauth2') {
      const body  = await readBody(req);
      const token = body.token;
      const stored = introspectDb.get(token);
      if (!stored || stored.exp < Math.floor(Date.now() / 1000)) {
        return pfedOk(res, 200, { active: false });
      }
      return pfedOk(res, 200, {
        active:    true,
        sub:       stored.sub,
        scope:     stored.scope,
        vendor_id: stored.vendor_id,
        exp:       stored.exp,
        iss:       stored.iss,
      });
    }

    // ── GET /api/report/:id — ownership-checked resource (BOLA target) ────────
    if (req.method === 'GET' && pathname.startsWith('/api/report/')) {
      const reportId = pathname.replace('/api/report/', '');
      const payload  = bearerPayload(req);
      if (!payload) {
        res.writeHead(401, { 'WWW-Authenticate': 'Bearer realm="pfed.local"', 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ code: 'UNAUTHORIZED', message: 'Authentication required' }));
      }

      const resource = resources.get(reportId);
      if (!resource) return pfedError(res, 404, 'NOT_FOUND', `Report '${reportId}' not found`);

      if (resource.ownerId !== payload.sub)
        return pfedError(res, 403, 'FORBIDDEN', 'Access denied — report belongs to a different vendor',
          `ownerId: ${resource.ownerId}, requesterId: ${payload.sub}`);

      return pfedOk(res, 200, { reportId, data: resource.data });
    }

    // ── GET /pa/protected — PingAccess-style secure endpoint ─────────────────
    // Secure: ignores all X-* identity headers, requires valid JWT only
    if (req.method === 'GET' && pathname === '/pa/protected') {
      const payload = bearerPayload(req);
      if (!payload) {
        res.writeHead(401, {
          'WWW-Authenticate': 'Bearer realm="pingaccess.local"',
          'Content-Type':     'application/json',
          'X-PingAccess-Error': 'true',
        });
        return res.end(JSON.stringify({ code: 'PINGACCESS_UNAUTHORIZED', message: 'Access denied by PingAccess policy' }));
      }
      return pfedOk(res, 200, { authn: 'jwt', sub: payload.sub, vendor_id: payload.vendor_id });
    }

    // ── GET /pa/misconfigured — simulates a misconfigured PingAccess backend ──
    // Trusts X-PingAccess-Authenticated-User and similar headers without JWT verification.
    // Use this endpoint to demonstrate what header injection looks like on a vulnerable deployment.
    if (req.method === 'GET' && pathname === '/pa/misconfigured') {
      const injected = req.headers['x-pingaccess-authenticated-user']
                    || req.headers['x-authenticated-user']
                    || req.headers['x-forwarded-user']
                    || req.headers['x-remote-user'];
      if (injected) {
        return pfedOk(res, 200, {
          authn:   'header-injection',
          sub:     injected,
          warning: 'MISCONFIGURED — access granted via injected identity header, no JWT verified',
        }, { 'X-PingAccess-Error': 'false' });
      }
      const payload = bearerPayload(req);
      if (!payload) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ code: 'UNAUTHORIZED' }));
      }
      return pfedOk(res, 200, { authn: 'jwt', sub: payload.sub });
    }

    pfedError(res, 404, 'NOT_FOUND', `No handler for ${pathname}`);
  });

  return srv;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const PORT = parseInt(process.env.PFED_PORT || '9000', 10);
  const srv  = createServer();
  srv.listen(PORT, () => {
    console.log(`\nMock PingFederate running at http://localhost:${PORT}`);
    console.log('\nEndpoints (PingFed paths):');
    [
      'GET  /as/authorization.oauth2     — auth code flow (PKCE-aware)',
      'POST /as/token.oauth2             — code / refresh_token / client_credentials',
      'GET  /idp/userinfo.openid         — userinfo (PingFederate path)',
      'POST /as/introspect.oauth2        — token introspection',
      'GET  /api/report/:id              — ownership-checked resource (BOLA target)',
      'GET  /pa/protected                — PingAccess secure endpoint (JWT only)',
      'GET  /pa/misconfigured            — PingAccess misconfigured (trusts X-* headers)',
    ].forEach(e => console.log(`  ${e}`));
    console.log('\nPre-registered clients:');
    Object.entries(CLIENTS).forEach(([id, c]) =>
      console.log(`  ${id.padEnd(20)} scopes: ${c.allowedScopes.join(', ')}  PKCE: ${c.requirePkce}`)
    );
  });
}

module.exports = { createServer, CLIENTS };
