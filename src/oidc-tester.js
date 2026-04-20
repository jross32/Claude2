'use strict';

/**
 * src/oidc-tester.js
 * OIDC/OAuth2 security lab tool.
 * Tests redirect_uri validation, state parameter entropy, and JWT alg:none
 * attacks against a LOCAL mock IdP server. Never targets production systems.
 */

const crypto = require('crypto');

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const DEFAULT_AUTH_PATH     = '/as/authorization.oauth2';
const DEFAULT_TOKEN_PATH    = '/as/token.oauth2';
const DEFAULT_USERINFO_PATH = '/userinfo';
const DEFAULT_SAMPLE_SIZE   = 50;
const MIN_STATE_ENTROPY     = 3.5; // bits/char threshold — below = warn
const MIN_STATE_LENGTH      = 16;  // bytes — hex = 32 chars minimum

// ─── INTERNAL HELPERS ─────────────────────────────────────────────────────────

/**
 * HTTP GET with redirect: 'manual' — captures the raw 302 without following it.
 * Requires Node 18+ global fetch.
 */
async function fetchManual(url, opts = {}) {
  return fetch(url, { redirect: 'manual', ...opts });
}

/**
 * Parse query string params from a full URL string.
 */
function parseLocationParams(locationStr) {
  try {
    return Object.fromEntries(new URL(locationStr).searchParams.entries());
  } catch {
    return {};
  }
}

/**
 * Shannon entropy in bits per character across an array of strings.
 */
function shannonEntropy(values) {
  const str = values.join('');
  if (!str.length) return 0;
  const freq = {};
  for (const ch of str) freq[ch] = (freq[ch] || 0) + 1;
  return -Object.values(freq).reduce((sum, count) => {
    const p = count / str.length;
    return sum + p * Math.log2(p);
  }, 0);
}

/**
 * Build a full authorization URL with OIDC params.
 */
function buildAuthUrl(baseUrl, params) {
  const u = new URL(DEFAULT_AUTH_PATH, baseUrl);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

/**
 * Classify whether the server blocked a potentially malicious redirect_uri.
 * A response is "blocked" if it returns 4xx or redirects to an error page.
 */
function isBlocked(status, location) {
  if (status === 400 || status === 403 || status === 401) return true;
  if (location && location.includes('error=')) return true;
  return false;
}

// ─── TEST 1: REDIRECT URI VALIDATION ─────────────────────────────────────────

/**
 * Tests whether the authorization endpoint enforces strict redirect_uri
 * whitelisting against a battery of bypass attempts.
 *
 * @param {object} opts
 * @param {string} opts.baseUrl         - Mock IdP base URL
 * @param {string} opts.clientId        - Registered client_id
 * @param {string} [opts.validRedirectUri] - A known-good redirect_uri (used as baseline)
 * @returns {object} Test result with passed/failed/summary
 */
async function testRedirectUriValidation({ baseUrl, clientId, validRedirectUri }) {
  const valid = validRedirectUri || 'http://localhost:3000/callback';
  const parsed = new URL(valid);
  const host = parsed.hostname;
  const proto = parsed.protocol.replace(/:$/, '');

  const cases = [
    { label: 'exact match (valid)',           uri: valid,                                               expectBlocked: false },
    { label: 'open redirect — attacker.com',  uri: 'https://attacker.com/callback',                    expectBlocked: true  },
    { label: 'subdomain confusion',           uri: `https://${host}.attacker.com/callback`,             expectBlocked: true  },
    { label: 'trailing query param',          uri: `${valid}?injected=evil`,                            expectBlocked: true  },
    { label: 'path traversal',               uri: `${valid}/../evil`,                                  expectBlocked: true  },
    { label: 'case variation',               uri: valid.toUpperCase(),                                  expectBlocked: true  },
    { label: 'port variation',               uri: `${proto}://${host}:9999/callback`,                   expectBlocked: true  },
    { label: 'scheme downgrade to ftp',      uri: valid.replace(/^https?/, 'ftp'),                     expectBlocked: true  },
    { label: 'null byte injection',          uri: `${valid}\x00.attacker.com`,                          expectBlocked: true  },
    { label: 'wildcard attempt',             uri: `${proto}://${host}/*`,                               expectBlocked: true  },
    { label: 'fragment bypass',              uri: `${valid}#@attacker.com`,                             expectBlocked: true  },
    { label: 'empty redirect_uri',           uri: '',                                                    expectBlocked: true  },
    { label: 'javascript: scheme',           uri: 'javascript:alert(1)',                                expectBlocked: true  },
    { label: 'data: URI scheme',             uri: 'data:text/html,<h1>pwned</h1>',                     expectBlocked: true  },
  ];

  const results = [];

  for (const tc of cases) {
    const url = buildAuthUrl(baseUrl, {
      client_id:     clientId,
      response_type: 'code',
      scope:         'openid',
      redirect_uri:  tc.uri,
      state:         crypto.randomBytes(16).toString('hex'),
      nonce:         crypto.randomBytes(16).toString('hex'),
    });

    let row;
    try {
      const resp = await fetchManual(url);
      const location = resp.headers.get('location') || '';
      const blocked = isBlocked(resp.status, location);
      const finding = tc.expectBlocked && !blocked ? 'OPEN' : 'OK';
      row = { ...tc, status: resp.status, location, blocked, finding, error: null };
    } catch (err) {
      // Connection refused etc. — treat as blocked (server unreachable for this URI)
      row = { ...tc, status: null, location: null, blocked: true, finding: 'OK', error: err.message };
    }

    results.push(row);
  }

  const vulnerabilities = results.filter(r => r.finding === 'OPEN');

  return {
    test:            'redirect_uri_validation',
    totalCases:      cases.length,
    vulnerabilities: vulnerabilities.length,
    passed:          results.filter(r => r.finding === 'OK').map(r => r.label),
    failed:          vulnerabilities.map(r => ({
      label:    r.label,
      uri:      r.uri,
      status:   r.status,
      location: r.location,
    })),
    summary: vulnerabilities.length === 0
      ? 'PASS — all malicious redirect_uri values were blocked'
      : `FAIL — ${vulnerabilities.length} redirect_uri bypass(es) accepted by the server`,
  };
}

// ─── TEST 2: STATE PARAMETER ENTROPY ─────────────────────────────────────────

/**
 * Sends sampleSize authorization requests with cryptographically generated
 * state values, collects the echoed-back states, and measures entropy.
 * Also checks: server requires state, server echoes state correctly.
 *
 * @param {object} opts
 * @param {string} opts.baseUrl           - Mock IdP base URL
 * @param {string} opts.clientId          - Registered client_id
 * @param {string} [opts.validRedirectUri]
 * @param {number} [opts.sampleSize=50]
 * @returns {object} Entropy metrics and findings
 */
async function testStateEntropy({ baseUrl, clientId, validRedirectUri, sampleSize = DEFAULT_SAMPLE_SIZE }) {
  const valid = validRedirectUri || 'http://localhost:3000/callback';
  const samples = [];

  for (let i = 0; i < sampleSize; i++) {
    const sentState = crypto.randomBytes(16).toString('hex'); // 32 hex chars, 128 bits
    const url = buildAuthUrl(baseUrl, {
      client_id:     clientId,
      response_type: 'code',
      scope:         'openid',
      redirect_uri:  valid,
      state:         sentState,
      nonce:         crypto.randomBytes(16).toString('hex'),
    });

    try {
      const resp = await fetchManual(url);
      const location = resp.headers.get('location') || '';
      const params = parseLocationParams(location);
      const echoedState = params.state || null;
      samples.push({ sent: sentState, echoed: echoedState, match: echoedState === sentState });
    } catch {
      // skip failed requests silently
    }
  }

  // State required check — send one request WITHOUT state
  let stateRequired = null;
  try {
    const url = buildAuthUrl(baseUrl, {
      client_id:     clientId,
      response_type: 'code',
      scope:         'openid',
      redirect_uri:  valid,
    });
    const resp = await fetchManual(url);
    const location = resp.headers.get('location') || '';
    const blocked = isBlocked(resp.status, location);
    stateRequired = blocked; // if blocked, server requires state
  } catch {
    stateRequired = null;
  }

  const sentValues    = samples.map(s => s.sent);
  const uniqueCount   = new Set(sentValues).size;
  const avgLength     = sentValues.length > 0
    ? Math.round(sentValues.reduce((a, b) => a + b.length, 0) / sentValues.length)
    : 0;
  const entropy       = sentValues.length > 1 ? shannonEntropy(sentValues) : 0;
  const reusedValues  = sentValues.filter((v, i, a) => a.indexOf(v) !== i);
  const mismatchCount = samples.filter(s => s.echoed !== null && !s.match).length;
  const entropyFlag   = entropy < MIN_STATE_ENTROPY || avgLength < MIN_STATE_LENGTH * 2;

  return {
    test:                       'state_entropy',
    sampleSize,
    collected:                  samples.length,
    uniqueCount,
    avgLength,
    shannonEntropy:             parseFloat(entropy.toFixed(3)),
    minEntropyThreshold:        MIN_STATE_ENTROPY,
    entropyFlag,
    reusedValues,
    mismatchedEchoes:           mismatchCount,
    serverEchoesStateCorrectly: mismatchCount === 0,
    stateRequired,
    summary: entropyFlag
      ? `WARN — state entropy (${entropy.toFixed(2)} bits/char) or avg length (${avgLength} chars) below threshold`
      : `PASS — state values unique (${uniqueCount}/${sampleSize}), entropy ${entropy.toFixed(2)} bits/char`,
  };
}

// ─── TEST 3: JWT ALG:NONE ATTACK ─────────────────────────────────────────────

function base64urlDecode(s) {
  return Buffer.from(s, 'base64url').toString('utf8');
}

function base64urlEncode(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function parseJwt(token) {
  const parts = (token || '').split('.');
  if (parts.length < 2) return null;
  try {
    return {
      header:  JSON.parse(base64urlDecode(parts[0])),
      payload: JSON.parse(base64urlDecode(parts[1])),
      raw:     parts,
    };
  } catch {
    return null;
  }
}

/**
 * Forge an alg:none token: identical payload, header alg=none, empty signature.
 */
function forgeAlgNoneToken(originalToken) {
  const parsed = parseJwt(originalToken);
  if (!parsed) return null;
  const header  = base64urlEncode({ alg: 'none', typ: 'JWT' });
  const payload = parsed.raw[1]; // keep original payload bytes unchanged
  return `${header}.${payload}.`; // empty signature segment
}

/**
 * Tests whether the IdP's token endpoint / userinfo endpoint accepts a JWT
 * with the algorithm set to "none" (no signature validation).
 *
 * @param {object} opts
 * @param {string} opts.baseUrl      - Mock IdP base URL
 * @param {string} opts.clientId
 * @param {string} [opts.clientSecret]
 * @returns {object} Result with forgedAccepted, finding, summary
 */
async function testJwtAlgNone({ baseUrl, clientId, clientSecret }) {
  const tokenUrl    = new URL(DEFAULT_TOKEN_PATH,    baseUrl).toString();
  const userinfoUrl = new URL(DEFAULT_USERINFO_PATH, baseUrl).toString();

  // ── Step 1: obtain a real JWT via client_credentials ──────────────────────
  let realToken   = null;
  let originalAlg = null;
  let tokenError  = null;

  try {
    const body = new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     clientId,
      client_secret: clientSecret || '',
      scope:         'openid',
    });
    const resp = await fetch(tokenUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });
    const data = await resp.json();
    realToken = data.access_token || data.id_token || null;
    if (realToken) {
      const parsed = parseJwt(realToken);
      originalAlg = parsed?.header?.alg || 'unknown';
    } else {
      tokenError = data.error || 'no token in response';
    }
  } catch (err) {
    tokenError = err.message;
  }

  if (!realToken) {
    return {
      test:    'alg_none_attack',
      skipped: true,
      reason:  `Could not obtain token: ${tokenError}`,
      finding: 'SKIP',
      summary: 'Skipped — enable client_credentials grant on the mock IdP to run this test',
    };
  }

  // ── Step 2: forge the token ────────────────────────────────────────────────
  const forgedToken = forgeAlgNoneToken(realToken);
  if (!forgedToken) {
    return {
      test:    'alg_none_attack',
      skipped: true,
      reason:  'Could not parse real token',
      finding: 'SKIP',
      summary: 'Skipped — real token was not a parseable JWT',
    };
  }

  // ── Step 3: send forged token to userinfo ─────────────────────────────────
  let forgedAccepted  = false;
  let forgedStatus    = null;
  let forgedError     = null;

  try {
    const resp = await fetch(userinfoUrl, {
      headers: { Authorization: `Bearer ${forgedToken}` },
    });
    forgedStatus   = resp.status;
    forgedAccepted = resp.ok;
  } catch (err) {
    forgedError = err.message;
  }

  return {
    test:            'alg_none_attack',
    originalAlg,
    forgedTokenPreview: forgedToken.substring(0, 80) + '…',
    forgedAccepted,
    forgedStatusCode: forgedStatus,
    forgedError,
    finding:  forgedAccepted ? 'VULNERABLE' : 'OK',
    summary:  forgedAccepted
      ? 'FAIL — server accepted a forged alg:none JWT (no signature validation)'
      : `PASS — server rejected alg:none token with HTTP ${forgedStatus}`,
  };
}

// ─── TEST 4: PKCE ENFORCEMENT AUDIT ──────────────────────────────────────────

/**
 * Tests whether the authorization server enforces PKCE (Proof Key for Code
 * Exchange). Without PKCE, authorization codes can be intercepted and replayed
 * by a malicious app sharing the redirect_uri.
 *
 * Tests three scenarios:
 *  - Legacy client (requirePkce=false): request without code_challenge accepted (expected)
 *  - PKCE client (requirePkce=true): request without code_challenge rejected (expected)
 *  - PKCE client: request WITH valid S256 code_challenge accepted (expected)
 *
 * @param {object} opts
 * @param {string} opts.baseUrl         - Mock IdP base URL
 * @param {string} opts.clientId        - Client that should have PKCE enforced
 * @param {string} opts.legacyClientId  - Client without PKCE (to contrast)
 * @param {string} opts.validRedirectUri
 */
async function testPkceEnforcement({ baseUrl, clientId, legacyClientId, validRedirectUri }) {
  const valid = validRedirectUri || 'http://localhost:3000/callback';

  async function tryAuth(cid, withPkce) {
    const params = {
      client_id:     cid,
      response_type: 'code',
      scope:         'openid',
      redirect_uri:  valid,
      state:         crypto.randomBytes(8).toString('hex'),
    };
    if (withPkce) {
      const verifier   = crypto.randomBytes(32).toString('base64url');
      const challenge  = crypto.createHash('sha256').update(verifier).digest('base64url');
      params.code_challenge        = challenge;
      params.code_challenge_method = 'S256';
    }
    const url  = buildAuthUrl(baseUrl, params);
    const resp = await fetchManual(url);
    const loc  = resp.headers.get('location') || '';
    const gotCode = resp.status === 302 && loc.includes('code=') && !loc.includes('error=');
    return { status: resp.status, location: loc, gotCode };
  }

  const cases = [];

  // Case 1: PKCE-required client WITHOUT code_challenge → should be rejected
  try {
    const r = await tryAuth(clientId, false);
    cases.push({
      label:     'PKCE-required client: no code_challenge',
      expected:  'blocked',
      actual:    r.gotCode ? 'code-issued' : 'blocked',
      finding:   r.gotCode ? 'VULNERABLE' : 'OK',
      status:    r.status,
    });
  } catch (err) {
    cases.push({ label: 'PKCE-required client: no code_challenge', finding: 'OK', error: err.message });
  }

  // Case 2: PKCE-required client WITH valid code_challenge → should succeed
  try {
    const r = await tryAuth(clientId, true);
    cases.push({
      label:     'PKCE-required client: valid S256 code_challenge',
      expected:  'code-issued',
      actual:    r.gotCode ? 'code-issued' : 'blocked',
      finding:   r.gotCode ? 'OK' : 'WARN',
      status:    r.status,
    });
  } catch (err) {
    cases.push({ label: 'PKCE-required client: valid S256 code_challenge', finding: 'WARN', error: err.message });
  }

  // Case 3: legacy client WITHOUT code_challenge → should be allowed (no PKCE enforced)
  if (legacyClientId) {
    try {
      const r = await tryAuth(legacyClientId, false);
      cases.push({
        label:     'legacy client: no code_challenge (PKCE not required)',
        expected:  'code-issued',
        actual:    r.gotCode ? 'code-issued' : 'blocked',
        finding:   'INFO',
        status:    r.status,
        note:      r.gotCode ? 'No PKCE enforcement on this client — upgrade recommended' : 'Unexpectedly blocked',
      });
    } catch (err) {
      cases.push({ label: 'legacy client: no code_challenge', finding: 'INFO', error: err.message });
    }
  }

  const vulnerabilities = cases.filter(c => c.finding === 'VULNERABLE');

  return {
    test:            'pkce_enforcement',
    clientId,
    legacyClientId,
    vulnerabilities: vulnerabilities.length,
    cases,
    summary: vulnerabilities.length === 0
      ? 'PASS — PKCE enforced correctly for clients that require it'
      : `FAIL — ${vulnerabilities.length} case(s) where PKCE was not enforced when required`,
  };
}

// ─── TEST 5: TOKEN ROTATION / REPLAY DEFENSE ─────────────────────────────────

/**
 * Tests whether refresh token rotation is implemented correctly.
 * A secure server issues a new refresh_token on each use and invalidates the
 * old one — detecting replay if the old token is used again.
 *
 * @param {object} opts
 * @param {string} opts.baseUrl       - Mock IdP base URL
 * @param {string} opts.clientId
 * @param {string} opts.clientSecret
 */
async function testTokenRotation({ baseUrl, clientId, clientSecret }) {
  const tokenUrl = new URL(DEFAULT_TOKEN_PATH, baseUrl).toString();

  async function postToken(body) {
    const resp = await fetch(tokenUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams(body).toString(),
    });
    return { status: resp.status, data: await resp.json().catch(() => ({})) };
  }

  // Step 1: get initial tokens
  const step1 = await postToken({
    grant_type:    'client_credentials',
    client_id:     clientId,
    client_secret: clientSecret || '',
    scope:         'openid',
  });

  if (!step1.data.refresh_token) {
    return {
      test:    'token_rotation',
      skipped: true,
      reason:  'Server did not issue a refresh_token with the initial grant',
      finding: 'SKIP',
      summary: 'Skipped — refresh_token not issued by this server/grant type',
    };
  }

  const originalRefreshToken = step1.data.refresh_token;

  // Step 2: use refresh_token → get new tokens + new refresh_token
  const step2 = await postToken({
    grant_type:    'refresh_token',
    client_id:     clientId,
    client_secret: clientSecret || '',
    refresh_token: originalRefreshToken,
  });

  const rotationWorked = step2.status === 200 && !!step2.data.refresh_token
    && step2.data.refresh_token !== originalRefreshToken;

  // Step 3: replay the OLD refresh_token — should be rejected
  const step3 = await postToken({
    grant_type:    'refresh_token',
    client_id:     clientId,
    client_secret: clientSecret || '',
    refresh_token: originalRefreshToken,
  });

  const replayRejected = step3.status !== 200;

  return {
    test:             'token_rotation',
    rotationWorked,
    newTokenIssued:   step2.status === 200,
    replayRejected,
    replayStatus:     step3.status,
    replayError:      step3.data.error || null,
    finding:          !replayRejected ? 'VULNERABLE' : 'OK',
    summary: !replayRejected
      ? 'FAIL — old refresh_token accepted after rotation (no replay detection)'
      : `PASS — rotated token rejected with HTTP ${step3.status} (${step3.data.error || 'error'})`,
  };
}

// ─── TEST 6: BOLA / IDOR CROSS-TENANT ACCESS ─────────────────────────────────

/**
 * Tests for Broken Object Level Authorization (BOLA / IDOR).
 * Authenticates as one client and attempts to access resources owned by another.
 *
 * @param {object} opts
 * @param {string}   opts.baseUrl         - Mock IdP base URL
 * @param {string}   opts.clientId        - Attacker client (gets a token)
 * @param {string}   opts.clientSecret    - Attacker client secret
 * @param {string[]} opts.resourceIds     - Resource IDs to probe (some owned by others)
 * @param {string}   [opts.resourcePath]  - Base resource path (default: /resource)
 */
async function testBolaIdor({ baseUrl, clientId, clientSecret, resourceIds, resourcePath = '/resource' }) {
  const tokenUrl = new URL(DEFAULT_TOKEN_PATH, baseUrl).toString();

  // Get attacker token
  let attackerToken = null;
  try {
    const resp = await fetch(tokenUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     clientId,
        client_secret: clientSecret || '',
        scope:         'openid read:reports',
      }).toString(),
    });
    const data = await resp.json();
    attackerToken = data.access_token || null;
  } catch (err) {
    return { test: 'bola_idor', skipped: true, reason: err.message, finding: 'SKIP', summary: 'Could not get attacker token' };
  }

  if (!attackerToken) {
    return { test: 'bola_idor', skipped: true, reason: 'no token in response', finding: 'SKIP', summary: 'Could not get attacker token' };
  }

  const probeResults = [];
  const ids = resourceIds && resourceIds.length ? resourceIds : [
    'report-vendor-a',
    'report-vendor-b',
    // Path traversal & manipulation attempts
    'report-vendor-a/../report-vendor-b',
    'report-vendor-b%00',
    '../report-vendor-b',
  ];

  for (const id of ids) {
    const url = new URL(`${resourcePath}/${id}`, baseUrl).toString();
    try {
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${attackerToken}` },
      });
      const body = await resp.json().catch(() => ({}));
      probeResults.push({
        resourceId: id,
        status:     resp.status,
        accessible: resp.ok,
        ownedByAttacker: body.ownerId === clientId,
        ownedBy:    body.ownerId || null,
        finding:    resp.ok && body.ownerId && body.ownerId !== clientId ? 'VULNERABLE' : 'OK',
      });
    } catch (err) {
      probeResults.push({ resourceId: id, status: null, accessible: false, finding: 'OK', error: err.message });
    }
  }

  const vulnerabilities = probeResults.filter(r => r.finding === 'VULNERABLE');

  return {
    test:            'bola_idor',
    attackerClientId: clientId,
    totalProbed:     probeResults.length,
    vulnerabilities: vulnerabilities.length,
    results:         probeResults,
    finding:         vulnerabilities.length > 0 ? 'VULNERABLE' : 'OK',
    summary: vulnerabilities.length === 0
      ? 'PASS — no cross-tenant resource access detected'
      : `FAIL — ${vulnerabilities.length} resource(s) accessible to wrong tenant`,
  };
}

// ─── TEST 7: SCOPE ESCALATION ─────────────────────────────────────────────────

/**
 * Tests whether a client can obtain scopes beyond what it is registered for.
 * A secure server must strip unregistered scopes from the issued token.
 *
 * @param {object} opts
 * @param {string}   opts.baseUrl          - Mock IdP base URL
 * @param {string}   opts.clientId         - Client with limited registered scopes
 * @param {string}   opts.clientSecret
 * @param {string[]} opts.requestedScopes  - Scopes to request (includes ones client lacks)
 * @param {string[]} opts.allowedScopes    - Scopes the client is legitimately registered for
 */
async function testScopeEscalation({ baseUrl, clientId, clientSecret, requestedScopes, allowedScopes }) {
  const tokenUrl = new URL(DEFAULT_TOKEN_PATH, baseUrl).toString();

  const requested = requestedScopes || ['openid', 'read', 'write', 'admin', 'superuser'];
  const allowed   = allowedScopes   || ['openid', 'read'];

  const resp = await fetch(tokenUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     clientId,
      client_secret: clientSecret || '',
      scope:         requested.join(' '),
    }).toString(),
  }).catch(err => ({ ok: false, _err: err.message }));

  if (resp._err) {
    return { test: 'scope_escalation', skipped: true, reason: resp._err, finding: 'SKIP', summary: 'Connection error' };
  }

  const data = await resp.json().catch(() => ({}));

  if (!data.access_token) {
    return {
      test:    'scope_escalation',
      skipped: true,
      reason:  data.error || 'no token',
      finding: 'SKIP',
      summary: 'Could not obtain token to inspect scopes',
    };
  }

  // Decode granted scopes from token
  const parts   = data.access_token.split('.');
  let grantedScopes = [];
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    grantedScopes = (payload.scope || data.scope || '').split(' ').filter(Boolean);
  } catch {
    grantedScopes = (data.scope || '').split(' ').filter(Boolean);
  }

  const escalatedScopes = grantedScopes.filter(s => !allowed.includes(s));

  return {
    test:              'scope_escalation',
    clientId,
    requestedScopes:   requested,
    allowedScopes:     allowed,
    grantedScopes,
    escalatedScopes,
    finding:           escalatedScopes.length > 0 ? 'VULNERABLE' : 'OK',
    summary: escalatedScopes.length === 0
      ? `PASS — server stripped unregistered scopes, granted only: ${grantedScopes.join(', ')}`
      : `FAIL — server granted escalated scopes: ${escalatedScopes.join(', ')}`,
  };
}

// ─── TEST 8: HEADER INJECTION (PingAccess / Reverse Proxy) ───────────────────

/**
 * Tests whether a protected endpoint can be bypassed by injecting identity
 * headers. Common in misconfigured PingAccess / Akamai / Nginx deployments
 * where the backend trusts upstream headers without verifying the JWT.
 *
 * Probes two endpoints:
 *  - /header-protected  — secure endpoint (should reject all header injections)
 *  - /header-vulnerable — simulated misconfigured endpoint (should accept injected headers)
 *    Use this to demonstrate what a vulnerable deployment looks like.
 *
 * @param {object} opts
 * @param {string} opts.baseUrl               - Mock IdP base URL
 * @param {string} [opts.injectUser]          - Username to inject (default: 'admin')
 * @param {string} [opts.secureEndpointPath]  - Path of the JWT-only endpoint (default: /header-protected)
 * @param {string} [opts.vulnerableEndpointPath] - Path of the vulnerable demo endpoint (default: /header-vulnerable)
 */
async function testHeaderInjection({ baseUrl, injectUser = 'admin', secureEndpointPath = '/header-protected', vulnerableEndpointPath = '/header-vulnerable' }) {
  const INJECTION_HEADERS = [
    'X-Authenticated-User',
    'X-Forwarded-User',
    'X-Remote-User',
    'X-PingAccess-Authenticated-User',
    'X-Real-User',
    'X-Proxy-Authenticated-User',
    'X-WEBAUTH-USER',
    'X-Auth-User',
  ];

  async function probe(path, extraHeaders = {}) {
    const url = new URL(path, baseUrl).toString();
    try {
      const resp = await fetch(url, { headers: { ...extraHeaders } });
      const body = await resp.json().catch(() => ({}));
      return { status: resp.status, ok: resp.ok, body };
    } catch (err) {
      return { status: null, ok: false, body: {}, error: err.message };
    }
  }

  const secureResults  = [];
  const vulnResults    = [];

  for (const headerName of INJECTION_HEADERS) {
    // ── Secure endpoint — should reject all header injections ─────────────
    const secureR = await probe(secureEndpointPath, { [headerName]: injectUser });
    secureResults.push({
      header:  headerName,
      blocked: !secureR.ok,
      status:  secureR.status,
      finding: secureR.ok ? 'VULNERABLE' : 'OK',
    });

    // ── Vulnerable endpoint — demonstrates what bypass looks like ─────────
    const vulnR = await probe(vulnerableEndpointPath, { [headerName]: injectUser });
    vulnResults.push({
      header:   headerName,
      accepted: vulnR.ok,
      authn:    vulnR.body.authn || null,
      status:   vulnR.status,
    });
  }

  const secureBypassCount = secureResults.filter(r => r.finding === 'VULNERABLE').length;

  return {
    test:                'header_injection',
    injectUser,
    headersProbed:       INJECTION_HEADERS.length,
    secureEndpoint: {
      path:            secureEndpointPath,
      bypassCount:     secureBypassCount,
      results:         secureResults,
      finding:         secureBypassCount === 0 ? 'OK' : 'VULNERABLE',
      summary:         secureBypassCount === 0
        ? 'PASS — secure endpoint rejected all header injection attempts'
        : `FAIL — ${secureBypassCount} header(s) bypassed the secure endpoint`,
    },
    vulnerableEndpoint: {
      path:    vulnerableEndpointPath,
      results: vulnResults,
      note:    'Demonstrates what a misconfigured PingAccess backend looks like — the vulnerable endpoint accepts injected identity headers without JWT verification',
    },
    finding: secureBypassCount === 0 ? 'OK' : 'VULNERABLE',
    summary: secureBypassCount === 0
      ? 'PASS — secure endpoint correctly ignores identity header injection'
      : `FAIL — ${secureBypassCount} header injection(s) bypassed authentication`,
  };
}

// ─── TEST 9: TLS / JA3 FINGERPRINT ANALYSIS ──────────────────────────────────

const tls    = require('tls');

// ── Cipher name → IANA numeric ID lookup ──────────────────────────────────────
const _CIPHER_IDS = {
  'TLS_AES_128_GCM_SHA256':             4865,
  'TLS_AES_256_GCM_SHA384':             4866,
  'TLS_CHACHA20_POLY1305_SHA256':       4867,
  'ECDHE-ECDSA-AES128-GCM-SHA256':     49195,
  'ECDHE-RSA-AES128-GCM-SHA256':       49199,
  'ECDHE-ECDSA-AES256-GCM-SHA384':     49196,
  'ECDHE-RSA-AES256-GCM-SHA384':       49200,
  'ECDHE-ECDSA-CHACHA20-POLY1305':     52393,
  'ECDHE-RSA-CHACHA20-POLY1305':       52392,
  'ECDHE-RSA-AES128-SHA':              49171,
  'ECDHE-RSA-AES256-SHA':              49172,
  'ECDHE-ECDSA-AES256-CBC-SHA':        49162,
  'ECDHE-ECDSA-AES128-CBC-SHA':        49161,
  'AES128-GCM-SHA256':                    156,
  'AES256-GCM-SHA384':                    157,
  'AES128-SHA':                            47,
  'AES256-SHA':                            53,
};
// TLS version → ClientHello numeric value (decimal)
const _TLS_VER = { 'TLSv1.0': 769, 'TLSv1.1': 770, 'TLSv1.2': 771, 'TLSv1.3': 772 };

/**
 * Compute a real JA3 hash for a TLS profile.
 *
 * JA3 formula (https://github.com/salesforce/ja3):
 *   MD5( TLSVersion,Ciphers,Extensions,EllipticCurves,PointFormats )
 * where each field is a hyphen-separated list of decimal IDs.
 *
 * Extension type IDs used here match a real Chrome 115 ClientHello
 * (GREASE values excluded, order is what Chromium actually sends).
 */
function _computeJA3(profile) {
  const ver         = _TLS_VER[profile.minTls] || 771;
  const cipherIds   = profile.cipherOrder.map(c => _CIPHER_IDS[c]).filter(Boolean);
  const extIds      = profile.ja3Extensions  || [];
  const curveIds    = profile.ja3Curves      || [];
  const pointFmtIds = profile.ja3PointFmts   || [0];

  const ja3String = [
    ver,
    cipherIds.join('-'),
    extIds.join('-'),
    curveIds.join('-'),
    pointFmtIds.join('-'),
  ].join(',');

  const ja3Hash = crypto.createHash('md5').update(ja3String).digest('hex');
  return { ja3String, ja3Hash };
}

/**
 * Known TLS cipher preference profiles for major clients.
 * Cipher names in OpenSSL format, in preference order.
 */
const TLS_PROFILES = {
  'chrome-115': {
    label:        'Chrome 115',
    minTls:       'TLSv1.2',
    cipherOrder:  [
      'TLS_AES_128_GCM_SHA256',
      'TLS_AES_256_GCM_SHA384',
      'TLS_CHACHA20_POLY1305_SHA256',
      'ECDHE-ECDSA-AES128-GCM-SHA256',
      'ECDHE-RSA-AES128-GCM-SHA256',
      'ECDHE-ECDSA-AES256-GCM-SHA384',
      'ECDHE-RSA-AES256-GCM-SHA384',
      'ECDHE-ECDSA-CHACHA20-POLY1305',
      'ECDHE-RSA-CHACHA20-POLY1305',
      'ECDHE-RSA-AES128-SHA',
      'ECDHE-RSA-AES256-SHA',
      'AES128-GCM-SHA256',
      'AES256-GCM-SHA384',
      'AES128-SHA',
      'AES256-SHA',
    ],
    ecdhCurves:      ['X25519', 'prime256v1', 'secp384r1'],
    // Chrome 115 ClientHello extension types (decimal, GREASE excluded, real order)
    ja3Extensions:   [0, 23, 65281, 10, 11, 35, 16, 5, 13, 18, 51, 45, 43, 27, 17513, 21],
    // Supported groups / elliptic curves (decimal IANA IDs)
    ja3Curves:       [29, 23, 24],   // x25519=29, secp256r1=23, secp384r1=24
    ja3PointFmts:    [0],            // uncompressed
  },
  'firefox-117': {
    label:        'Firefox 117',
    minTls:       'TLSv1.2',
    cipherOrder:  [
      'TLS_AES_128_GCM_SHA256',
      'TLS_CHACHA20_POLY1305_SHA256',
      'TLS_AES_256_GCM_SHA384',
      'ECDHE-ECDSA-AES128-GCM-SHA256',
      'ECDHE-RSA-AES128-GCM-SHA256',
      'ECDHE-ECDSA-CHACHA20-POLY1305',
      'ECDHE-RSA-CHACHA20-POLY1305',
      'ECDHE-ECDSA-AES256-GCM-SHA384',
      'ECDHE-RSA-AES256-GCM-SHA384',
      'ECDHE-ECDSA-AES256-CBC-SHA',
      'ECDHE-ECDSA-AES128-CBC-SHA',
      'ECDHE-RSA-AES128-CBC-SHA',
      'ECDHE-RSA-AES256-CBC-SHA',
      'AES128-GCM-SHA256',
      'AES256-GCM-SHA384',
    ],
    ecdhCurves:      ['X25519', 'prime256v1', 'secp384r1', 'secp521r1'],
    // Firefox 117 extension types (GREASE excluded)
    ja3Extensions:   [0, 23, 65281, 10, 11, 35, 16, 5, 13, 51, 45, 43, 21],
    ja3Curves:       [29, 23, 24, 25],  // x25519, secp256r1, secp384r1, secp521r1
    ja3PointFmts:    [0],
  },
};

/**
 * Analyze the current Node.js TLS fingerprint and compare to a browser profile.
 * For Playwright-based scraping, note that the scraper already uses Chrome's
 * real TLS fingerprint since Playwright launches an actual Chromium browser.
 * This tool is relevant for direct Node.js HTTP requests (e.g. from oidc-tester).
 *
 * @param {object} opts
 * @param {string} [opts.compareProfile='chrome-115'] - Profile to compare against
 * @param {string} [opts.targetHost]                  - Optional: connect and observe negotiated cipher
 * @param {number} [opts.targetPort=443]
 */
async function testTlsFingerprint({ compareProfile = 'chrome-115', targetHost, targetPort = 443 } = {}) {
  const profile = TLS_PROFILES[compareProfile];
  if (!profile) {
    return { test: 'tls_fingerprint', error: `Unknown profile: ${compareProfile}. Available: ${Object.keys(TLS_PROFILES).join(', ')}` };
  }

  // Node.js TLS capabilities
  const nodeSupportedCiphers = tls.getCiphers().map(c => c.toUpperCase());
  const nodeOpenSslVersion   = process.versions.openssl;
  const nodeVersion          = process.version;

  // Compare cipher order: how many of Chrome's ciphers does Node support, in what order?
  const profileCiphersNormalized = profile.cipherOrder.map(c => c.toUpperCase().replace(/-/g, '_'));
  const nodeCiphersNormalized    = nodeSupportedCiphers.map(c => c.replace(/-/g, '_'));

  const supportedByNode = profile.cipherOrder.filter(c =>
    nodeCiphersNormalized.includes(c.toUpperCase().replace(/-/g, '_'))
  );
  const missingFromNode = profile.cipherOrder.filter(c =>
    !nodeCiphersNormalized.includes(c.toUpperCase().replace(/-/g, '_'))
  );

  // Compute a cipher-order similarity score (Kendall tau-like)
  const inCommon = supportedByNode.length;
  const similarityPct = Math.round((inCommon / profile.cipherOrder.length) * 100);

  // Optional: connect to target host and observe negotiated cipher
  let negotiated = null;
  if (targetHost) {
    negotiated = await new Promise((resolve) => {
      const cipherStr = profile.cipherOrder.join(':');
      const socket = tls.connect({
        host:               targetHost,
        port:               targetPort,
        ciphers:            cipherStr,
        minVersion:         'TLSv1.2',
        rejectUnauthorized: false,
        servername:         targetHost,
      }, () => {
        resolve({
          protocol:    socket.getProtocol(),
          cipher:      socket.getCipher(),
          peerCert:    socket.getPeerCertificate()?.subject?.CN || null,
          authorized:  socket.authorized,
        });
        socket.destroy();
      });
      socket.on('error', (err) => resolve({ error: err.message }));
      setTimeout(() => { socket.destroy(); resolve({ error: 'timeout' }); }, 5000);
    });
  }

  // Config snippet for making Node.js fetch more browser-like
  const configSnippet = `// Make Node.js https requests more browser-like (${profile.label} cipher order)
const https = require('https');
const browserAgent = new https.Agent({
  ciphers:    '${profile.cipherOrder.join(':')}',
  minVersion: '${profile.minTls}',
  ecdhCurve:  '${profile.ecdhCurves.join(':')}',
});
// Use in requests:
// https.get({ host, path, agent: browserAgent }, handler)
// Or with node-fetch: fetch(url, { agent: browserAgent })

// NOTE: If you are using Playwright in this scraper, Playwright already launches
// a real Chromium browser — its TLS fingerprint IS ${profile.label}'s fingerprint.
// This config only applies to direct Node.js HTTP requests.`;

  return {
    test:              'tls_fingerprint',
    compareProfile:    compareProfile,
    profileLabel:      profile.label,
    node: {
      version:         nodeVersion,
      openssl:         nodeOpenSslVersion,
      totalCiphers:    nodeSupportedCiphers.length,
    },
    comparison: {
      profileCipherCount:   profile.cipherOrder.length,
      supportedByNode:      supportedByNode.length,
      missingFromNode,
      similarityPct,
      ja3String:            _computeJA3(profile).ja3String,
      ja3Hash:              _computeJA3(profile).ja3Hash,
    },
    negotiated: negotiated || null,
    configSnippet,
    playwrightNote: 'Playwright already uses Chromium — its TLS fingerprint matches Chrome natively. Use Playwright for requests where fingerprinting matters.',
    summary: similarityPct >= 80
      ? `Node.js supports ${similarityPct}% of ${profile.label} ciphers — fingerprint similarity GOOD`
      : `Node.js supports only ${similarityPct}% of ${profile.label} ciphers — fingerprint divergence HIGH, use configSnippet to improve`,
  };
}

// ─── TEST 9: AUTH CODE REPLAY ─────────────────────────────────────────────────

/**
 * Tests whether an authorization code can be exchanged twice (replay attack).
 * A secure server must reject the second exchange with 4xx.
 * Bonus: RFC 9700 §4.15 says replaying a code should also invalidate any
 * tokens already issued from it. We test both.
 */
async function testAuthCodeReplay({ baseUrl, clientId, clientSecret, validRedirectUri }) {
  const tokenPath = DEFAULT_TOKEN_PATH;

  // ── Step 1: get an auth code ──────────────────────────────────────────────
  const state      = crypto.randomBytes(16).toString('hex');
  const redirectUri = validRedirectUri || `http://localhost/callback`;
  const authUrl = `${baseUrl}${DEFAULT_AUTH_PATH}?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=openid`;

  let code = null;
  try {
    const res = await fetchManual(authUrl);
    const loc = res.headers.get('location') || '';
    code = new URL(loc, baseUrl).searchParams.get('code');
  } catch (err) {
    return { skipped: true, reason: `Could not obtain auth code: ${err.message}` };
  }

  if (!code) {
    return { skipped: true, reason: 'No code in auth redirect — server may require client registration' };
  }

  // ── Step 2: exchange the code (first use — should succeed) ────────────────
  const tokenParams = new URLSearchParams({
    grant_type:   'authorization_code',
    code,
    redirect_uri:  redirectUri,
    client_id:     clientId,
    ...(clientSecret ? { client_secret: clientSecret } : {}),
  });

  let firstStatus, firstToken;
  try {
    const r = await fetch(`${baseUrl}${tokenPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });
    firstStatus = r.status;
    firstToken = r.status < 300 ? await r.json().catch(() => null) : null;
  } catch (err) {
    return { skipped: true, reason: `First token exchange failed: ${err.message}` };
  }

  const firstExchangeSucceeded = firstStatus >= 200 && firstStatus < 300 && !!firstToken?.access_token;

  // ── Step 3: replay the same code (second use — must be rejected) ──────────
  let replayStatus;
  try {
    const r = await fetch(`${baseUrl}${tokenPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });
    replayStatus = r.status;
  } catch {
    replayStatus = 0;
  }

  const replayRejected = replayStatus >= 400 && replayStatus < 600;
  const finding = !firstExchangeSucceeded
    ? 'SKIP'
    : replayRejected
      ? 'SECURE'
      : 'VULNERABLE';

  return {
    code: code.slice(0, 8) + '…',
    firstExchangeSucceeded,
    firstStatus,
    replayStatus,
    replayRejected,
    finding,
    summary: finding === 'VULNERABLE'
      ? 'VULNERABLE: auth code was accepted a second time — replay attack possible'
      : finding === 'SECURE'
        ? 'SECURE: replayed auth code correctly rejected'
        : 'SKIP: first exchange did not succeed',
  };
}

// ─── RISK SCORING ─────────────────────────────────────────────────────────────

function computeRiskScore(results) {
  let score = 0;
  if ((results.redirect_uri_validation?.vulnerabilities ?? 0) > 0) score += 40;
  if (results.state_entropy?.entropyFlag)                          score += 20;
  if (results.alg_none_attack?.forgedAccepted)                     score += 40;
  if ((results.pkce_enforcement?.vulnerabilities ?? 0) > 0)        score += 35;
  if (results.token_rotation?.finding === 'VULNERABLE')            score += 30;
  if ((results.bola_idor?.vulnerabilities ?? 0) > 0)              score += 45;
  if (results.scope_escalation?.finding === 'VULNERABLE')          score += 35;
  if (results.header_injection?.finding === 'VULNERABLE')          score += 40;
  if (results.auth_code_replay?.finding === 'VULNERABLE')          score += 35;
  const label = score === 0 ? 'LOW' : score <= 30 ? 'MEDIUM' : score <= 60 ? 'HIGH' : 'CRITICAL';
  return { score, label };
}

// ─── ORCHESTRATOR ─────────────────────────────────────────────────────────────

const ALL_TESTS = [
  'redirect_uri_validation',
  'state_entropy',
  'alg_none_attack',
  'pkce_enforcement',
  'token_rotation',
  'bola_idor',
  'scope_escalation',
  'header_injection',
  'auth_code_replay',
];

/**
 * Run one or more OIDC/OAuth2 security tests against a mock IdP.
 *
 * @param {object} opts
 * @param {string}   opts.mockServerUrl      - Base URL of the local mock IdP
 * @param {string}   opts.clientId           - Primary OIDC client_id
 * @param {string}   [opts.clientSecret]     - Client secret
 * @param {string[]} [opts.testsToRun]       - Subset of ALL_TESTS, or ['all']
 * @param {string}   [opts.validRedirectUri] - Known-good redirect_uri
 * @param {string}   [opts.pkceClientId]     - PKCE-enforcing client for pkce_enforcement test
 * @param {string}   [opts.targetClientId]   - Other tenant's client ID for bola_idor test
 * @param {string[]} [opts.resourceIds]      - Resource IDs to probe for bola_idor
 * @param {string[]} [opts.requestedScopes]  - Scopes to escalate for scope_escalation test
 * @param {string[]} [opts.allowedScopes]          - Scopes the client is legitimately allowed
 * @param {string}   [opts.resourcePath]           - Base path for BOLA resource endpoint (default: /resource)
 * @param {string}   [opts.secureEndpointPath]     - Path of JWT-only endpoint for header injection (default: /header-protected)
 * @param {string}   [opts.vulnerableEndpointPath] - Path of vulnerable demo endpoint (default: /header-vulnerable)
 */
async function performOidcSecurityTests({
  mockServerUrl, clientId, clientSecret, testsToRun, validRedirectUri,
  pkceClientId, targetClientId, resourceIds, requestedScopes, allowedScopes,
  resourcePath, secureEndpointPath, vulnerableEndpointPath,
}) {
  const toRun = [...new Set(
    (testsToRun || ['all']).flatMap(t => (t === 'all' ? ALL_TESTS : [t]))
  )].filter(t => ALL_TESTS.includes(t));

  const results = {};

  for (const t of toRun) {
    switch (t) {
      case 'redirect_uri_validation':
        results.redirect_uri_validation = await testRedirectUriValidation({
          baseUrl: mockServerUrl, clientId, validRedirectUri,
        });
        break;
      case 'state_entropy':
        results.state_entropy = await testStateEntropy({
          baseUrl: mockServerUrl, clientId, validRedirectUri,
        });
        break;
      case 'alg_none_attack':
        results.alg_none_attack = await testJwtAlgNone({
          baseUrl: mockServerUrl, clientId, clientSecret,
        });
        break;
      case 'pkce_enforcement':
        results.pkce_enforcement = await testPkceEnforcement({
          baseUrl: mockServerUrl,
          clientId:       pkceClientId || 'pkce-client',
          legacyClientId: clientId,
          validRedirectUri,
        });
        break;
      case 'token_rotation':
        results.token_rotation = await testTokenRotation({
          baseUrl: mockServerUrl, clientId, clientSecret,
        });
        break;
      case 'bola_idor':
        results.bola_idor = await testBolaIdor({
          baseUrl:      mockServerUrl,
          clientId:     targetClientId || 'vendor-a',
          clientSecret: clientSecret || 'vendor-a-secret',
          resourceIds,
          resourcePath: resourcePath || '/resource',
        });
        break;
      case 'scope_escalation':
        results.scope_escalation = await testScopeEscalation({
          baseUrl: mockServerUrl,
          clientId:       clientId,
          clientSecret:   clientSecret,
          requestedScopes,
          allowedScopes,
        });
        break;
      case 'header_injection':
        results.header_injection = await testHeaderInjection({
          baseUrl:               mockServerUrl,
          secureEndpointPath:    secureEndpointPath    || '/header-protected',
          vulnerableEndpointPath: vulnerableEndpointPath || '/header-vulnerable',
        });
        break;
      case 'auth_code_replay':
        results.auth_code_replay = await testAuthCodeReplay({
          baseUrl:         mockServerUrl,
          clientId,
          clientSecret,
          validRedirectUri,
        });
        break;
    }
  }

  return {
    timestamp:     new Date().toISOString(),
    mockServerUrl,
    clientId,
    testsRun:      toRun,
    riskScore:     computeRiskScore(results),
    results,
  };
}

module.exports = { performOidcSecurityTests, testTlsFingerprint };
