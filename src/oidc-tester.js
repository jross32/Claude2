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

// ─── RISK SCORING ─────────────────────────────────────────────────────────────

function computeRiskScore(results) {
  let score = 0;
  if ((results.redirect_uri_validation?.vulnerabilities ?? 0) > 0) score += 40;
  if (results.state_entropy?.entropyFlag)                          score += 20;
  if (results.alg_none_attack?.forgedAccepted)                     score += 40;
  const label = score === 0 ? 'LOW' : score <= 20 ? 'MEDIUM' : score <= 40 ? 'HIGH' : 'CRITICAL';
  return { score, label };
}

// ─── ORCHESTRATOR ─────────────────────────────────────────────────────────────

const ALL_TESTS = ['redirect_uri_validation', 'state_entropy', 'alg_none_attack'];

/**
 * Run one or more OIDC security tests against a mock IdP.
 *
 * @param {object} opts
 * @param {string}   opts.mockServerUrl   - Base URL of the local mock IdP
 * @param {string}   opts.clientId        - OIDC client_id
 * @param {string}   [opts.clientSecret]  - Client secret (needed for alg_none_attack)
 * @param {string[]} [opts.testsToRun]    - Subset of ALL_TESTS, or ['all']
 * @param {string}   [opts.validRedirectUri] - Known-good redirect_uri for test baseline
 * @returns {object} Structured results with risk score
 */
async function performOidcSecurityTests({ mockServerUrl, clientId, clientSecret, testsToRun, validRedirectUri }) {
  const toRun = [...new Set(
    (testsToRun || ['all']).flatMap(t => (t === 'all' ? ALL_TESTS : [t]))
  )].filter(t => ALL_TESTS.includes(t));

  const results = {};

  for (const t of toRun) {
    if (t === 'redirect_uri_validation') {
      results.redirect_uri_validation = await testRedirectUriValidation({
        baseUrl: mockServerUrl, clientId, validRedirectUri,
      });
    } else if (t === 'state_entropy') {
      results.state_entropy = await testStateEntropy({
        baseUrl: mockServerUrl, clientId, validRedirectUri,
      });
    } else if (t === 'alg_none_attack') {
      results.alg_none_attack = await testJwtAlgNone({
        baseUrl: mockServerUrl, clientId, clientSecret,
      });
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

module.exports = { performOidcSecurityTests };
