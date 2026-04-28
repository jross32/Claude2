'use strict';

/**
 * JWT Decoder — extract and analyze JWT tokens from any scrape result.
 * Scans network headers, response bodies, localStorage, sessionStorage, cookies.
 * Decodes header + payload, flags security issues without verifying signatures.
 */

const KNOWN_ALGORITHMS = new Set([
  'HS256', 'HS384', 'HS512',
  'RS256', 'RS384', 'RS512',
  'ES256', 'ES384', 'ES512',
  'PS256', 'PS384', 'PS512',
  'EdDSA',
]);

const DANGEROUS_ALGORITHMS = new Set(['none', 'None', 'NONE']);

// Header names that commonly carry JWTs
const AUTH_HEADER_NAMES = new Set([
  'authorization', 'x-auth-token', 'x-access-token', 'x-id-token',
  'x-jwt-token', 'token', 'x-token', 'x-user-token', 'x-api-key',
]);

// Cookie names that commonly carry JWTs
const AUTH_COOKIE_NAMES = new Set([
  'token', 'jwt', 'access_token', 'id_token', 'auth_token',
  'bearer', 'session_token', 'refresh_token',
]);

// localStorage/sessionStorage key names that commonly carry JWTs
const AUTH_STORAGE_KEYS = new Set([
  'token', 'jwt', 'access_token', 'id_token', 'auth_token',
  'bearer', 'authToken', 'accessToken', 'idToken', 'refresh_token',
  'refreshToken', 'user_token', 'userToken',
]);

/**
 * Attempt base64url decode of a JWT segment.
 * Returns parsed object or null on failure.
 */
function decodeSegment(segment) {
  try {
    // Pad to multiple of 4
    const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4;
    const b64 = pad ? padded + '='.repeat(4 - pad) : padded;
    const json = Buffer.from(b64, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Decode a single JWT string.
 * Returns a rich analysis object or null if the string is not a valid JWT.
 */
function decodeJWT(token, source = 'unknown') {
  if (typeof token !== 'string') return null;

  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;

  const header = decodeSegment(parts[0]);
  const payload = decodeSegment(parts[1]);

  if (!header || !payload) return null;
  // Must have at least an 'alg' in header to be a real JWT
  if (!header.alg) return null;

  const now = Math.floor(Date.now() / 1000);

  // ── Security flags ──────────────────────────────────────────────────────
  const flags = [];

  if (DANGEROUS_ALGORITHMS.has(header.alg)) {
    flags.push({ severity: 'critical', code: 'ALG_NONE', message: 'Algorithm is "none" — token is unsigned, trivially forgeable' });
  }
  if (!KNOWN_ALGORITHMS.has(header.alg) && !DANGEROUS_ALGORITHMS.has(header.alg)) {
    flags.push({ severity: 'warn', code: 'ALG_UNKNOWN', message: `Unknown algorithm: ${header.alg}` });
  }

  const isExpired = payload.exp && payload.exp < now;
  const expiresIn = payload.exp ? payload.exp - now : null;
  const isExpiringSoon = !isExpired && expiresIn !== null && expiresIn < 300; // < 5 min

  if (isExpired) {
    flags.push({ severity: 'warn', code: 'EXPIRED', message: `Token expired ${Math.round((now - payload.exp) / 60)} min ago` });
  } else if (isExpiringSoon) {
    flags.push({ severity: 'info', code: 'EXPIRING_SOON', message: `Token expires in ${expiresIn}s` });
  }

  if (!payload.sub) {
    flags.push({ severity: 'info', code: 'MISSING_SUB', message: 'No "sub" (subject) claim' });
  }
  if (!payload.aud) {
    flags.push({ severity: 'info', code: 'MISSING_AUD', message: 'No "aud" (audience) claim — token may be accepted by unintended services' });
  }
  if (!payload.iss) {
    flags.push({ severity: 'info', code: 'MISSING_ISS', message: 'No "iss" (issuer) claim' });
  }

  // Detect if token contains sensitive-sounding custom claims
  const sensitiveKeys = Object.keys(payload).filter(k =>
    /password|secret|key|credential|ssn|dob|birth/i.test(k)
  );
  if (sensitiveKeys.length > 0) {
    flags.push({ severity: 'warn', code: 'SENSITIVE_CLAIMS', message: `Payload contains sensitive-sounding claims: ${sensitiveKeys.join(', ')}` });
  }

  return {
    source,
    raw: token,
    header,
    payload,
    signature: parts[2].substring(0, 20) + '…', // partial — never log full sig
    isExpired,
    isExpiringSoon,
    expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
    issuedAt: payload.iat ? new Date(payload.iat * 1000).toISOString() : null,
    notBefore: payload.nbf ? new Date(payload.nbf * 1000).toISOString() : null,
    subject: payload.sub || null,
    issuer: payload.iss || null,
    audience: payload.aud || null,
    scopes: payload.scope ? payload.scope.split(' ') : (payload.scp ? payload.scp : null),
    roles: payload.roles || payload.role || null,
    flags,
    securityScore: _scoreToken(flags),
  };
}

/**
 * Score the token's security posture 0–100 (100 = no issues).
 */
function _scoreToken(flags) {
  let score = 100;
  for (const f of flags) {
    if (f.severity === 'critical') score -= 40;
    else if (f.severity === 'warn') score -= 15;
    else if (f.severity === 'info') score -= 5;
  }
  return Math.max(0, score);
}

/**
 * Deduplicate tokens by header.payload fingerprint.
 */
function _dedup(tokens) {
  const seen = new Set();
  return tokens.filter(t => {
    const fp = `${t.raw.split('.')[0]}.${t.raw.split('.')[1]}`;
    if (seen.has(fp)) return false;
    seen.add(fp);
    return true;
  });
}

/**
 * Scan a string for embedded JWT patterns (eyJ prefix = base64 JSON starting with '{').
 * Returns all matched JWT strings found in the text.
 */
function _extractJWTsFromText(text) {
  if (typeof text !== 'string') return [];
  // JWT pattern: three base64url segments separated by dots
  const matches = text.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g) || [];
  return matches;
}

/**
 * Extract all JWTs from a full scrape result object.
 * Searches: network request/response headers, response bodies, localStorage, sessionStorage, cookies.
 */
function extractJWTs(scrapeResult) {
  const found = [];

  const addIfJWT = (raw, source) => {
    const decoded = decodeJWT(raw, source);
    if (decoded) found.push(decoded);
  };

  // ── Network headers ────────────────────────────────────────────────────
  const pages = scrapeResult.pages || scrapeResult.results || [];

  for (const page of pages) {
    // REST/API calls (captured by scraper)
    const apiCalls = page.apiCalls || page.restCalls || [];
    for (const call of apiCalls) {
      // Request headers
      if (call.requestHeaders || call.headers) {
        const reqHeaders = call.requestHeaders || call.headers || {};
        for (const [name, value] of Object.entries(reqHeaders)) {
          if (AUTH_HEADER_NAMES.has(name.toLowerCase())) {
            const bearer = typeof value === 'string' && value.startsWith('Bearer ')
              ? value.slice(7)
              : value;
            addIfJWT(bearer, `request-header:${name}`);
          }
        }
      }
      // Response headers
      if (call.responseHeaders) {
        for (const [name, value] of Object.entries(call.responseHeaders)) {
          if (AUTH_HEADER_NAMES.has(name.toLowerCase())) {
            addIfJWT(value, `response-header:${name}`);
          }
        }
      }
      // Response body — scan for embedded JWTs
      if (call.responseBody && typeof call.responseBody === 'string') {
        const embedded = _extractJWTsFromText(call.responseBody);
        embedded.forEach(t => addIfJWT(t, `response-body:${call.url || 'unknown'}`));
      }
      if (call.response && typeof call.response === 'string') {
        const embedded = _extractJWTsFromText(call.response);
        embedded.forEach(t => addIfJWT(t, `response-body:${call.url || 'unknown'}`));
      }
    }

    // GraphQL calls
    const gqlCalls = page.graphqlCalls || page.graphql || [];
    for (const call of gqlCalls) {
      if (call.requestHeaders) {
        for (const [name, value] of Object.entries(call.requestHeaders)) {
          if (AUTH_HEADER_NAMES.has(name.toLowerCase())) {
            const bearer = typeof value === 'string' && value.startsWith('Bearer ')
              ? value.slice(7)
              : value;
            addIfJWT(bearer, `graphql-header:${name}`);
          }
        }
      }
    }

    // ── localStorage ───────────────────────────────────────────────────
    const ls = page.localStorage || page.storage?.local || {};
    for (const [key, value] of Object.entries(ls)) {
      if (AUTH_STORAGE_KEYS.has(key)) {
        addIfJWT(value, `localStorage:${key}`);
      } else {
        // Scan value text regardless of key name
        const embedded = _extractJWTsFromText(String(value));
        embedded.forEach(t => addIfJWT(t, `localStorage:${key}`));
      }
    }

    // ── sessionStorage ─────────────────────────────────────────────────
    const ss = page.sessionStorage || page.storage?.session || {};
    for (const [key, value] of Object.entries(ss)) {
      if (AUTH_STORAGE_KEYS.has(key)) {
        addIfJWT(value, `sessionStorage:${key}`);
      } else {
        const embedded = _extractJWTsFromText(String(value));
        embedded.forEach(t => addIfJWT(t, `sessionStorage:${key}`));
      }
    }

    // ── Cookies ────────────────────────────────────────────────────────
    const cookies = page.cookies || [];
    for (const cookie of cookies) {
      if (!cookie) continue;
      const name = (cookie.name || '').toLowerCase();
      const value = cookie.value || '';
      if (AUTH_COOKIE_NAMES.has(name) || value.startsWith('eyJ')) {
        addIfJWT(value, `cookie:${cookie.name}`);
      }
    }
  }

  // Also scan top-level cookies if present (some scrape results store them there)
  const topCookies = scrapeResult.cookies || [];
  for (const cookie of topCookies) {
    if (!cookie) continue;
    const name = (cookie.name || '').toLowerCase();
    const value = cookie.value || '';
    if (AUTH_COOKIE_NAMES.has(name) || value.startsWith('eyJ')) {
      addIfJWT(value, `cookie:${cookie.name}`);
    }
  }

  const deduped = _dedup(found);

  return {
    count: deduped.length,
    tokens: deduped,
    summary: _summarize(deduped),
  };
}

function _summarize(tokens) {
  if (tokens.length === 0) return { totalFound: 0, expired: 0, critical: 0, warnings: 0 };
  const expired = tokens.filter(t => t.isExpired).length;
  const critical = tokens.filter(t => t.flags.some(f => f.severity === 'critical')).length;
  const warnings = tokens.filter(t => t.flags.some(f => f.severity === 'warn')).length;
  const avgScore = Math.round(tokens.reduce((s, t) => s + t.securityScore, 0) / tokens.length);
  const issuers = [...new Set(tokens.map(t => t.issuer).filter(Boolean))];
  const algorithms = [...new Set(tokens.map(t => t.header?.alg).filter(Boolean))];

  return {
    totalFound: tokens.length,
    expired,
    expiringSoon: tokens.filter(t => t.isExpiringSoon).length,
    critical,
    warnings,
    averageSecurityScore: avgScore,
    issuers,
    algorithms,
    sources: [...new Set(tokens.map(t => t.source))],
  };
}

module.exports = { decodeJWT, extractJWTs };
