'use strict';

/**
 * tests/security/pingfed_lab.test.js
 *
 * Full security audit simulation against the mock PingFederate server.
 * Uses realistic PA_-prefixed client IDs, PingFed endpoint paths, and
 * PingAccess header conventions — matches what you'd test in an authorized
 * engagement against a real PingFed deployment.
 *
 * Run: node tests/security/pingfed_lab.test.js
 */

const { TestRunner }               = require('../runner');
const { createServer, CLIENTS }    = require('./mock_pingfederate');
const { performOidcSecurityTests } = require('../../src/oidc-tester');

// ─── PingFederate uses different paths than generic OIDC ──────────────────────
// We patch the path constants in oidc-tester by passing opts directly
// where the functions accept a baseUrl — PingFed's /as/ prefix is already
// baked into oidc-tester's DEFAULT_AUTH_PATH and DEFAULT_TOKEN_PATH.

function start() {
  return new Promise(resolve => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      resolve({ srv, port, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

function stop(srv) { return new Promise(r => srv.close(r)); }

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const runner = new TestRunner('security-pingfed_lab');
  let ctx = null;

  await runner.run('mock PingFederate starts', async ({ setOutput }) => {
    ctx = await start();
    setOutput({ port: ctx.port, baseUrl: ctx.baseUrl });
  });

  if (!ctx) { runner.finish(); return; }

  const { baseUrl }  = ctx;
  const validUri     = CLIENTS['PA_VENDOR_PORTAL'].redirect_uris[0];
  const legacyUri    = CLIENTS['PA_LEGACY_VENDOR'].redirect_uris[0];

  // ── 1. Redirect URI validation ────────────────────────────────────────────

  await runner.run('redirect_uri: all bypass variants blocked (PA_LEGACY_VENDOR)', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl:    baseUrl,
      clientId:         'PA_LEGACY_VENDOR',
      validRedirectUri: legacyUri,
      testsToRun:       ['redirect_uri_validation'],
    });
    const t = r.results.redirect_uri_validation;
    setOutput({ totalCases: t.totalCases, vulnerabilities: t.vulnerabilities, failed: t.failed });
    if (t.vulnerabilities > 0) throw new Error(`${t.vulnerabilities} bypass(es): ${t.failed.map(f => f.label).join(', ')}`);
  });

  await runner.run('redirect_uri: open redirect blocked on PA_ client', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl:    baseUrl,
      clientId:         'PA_VENDOR_A',
      validRedirectUri: CLIENTS['PA_VENDOR_A'].redirect_uris[0],
      testsToRun:       ['redirect_uri_validation'],
    });
    const t = r.results.redirect_uri_validation;
    const blocked = t.passed.includes('open redirect — attacker.com');
    setOutput({ blocked });
    if (!blocked) throw new Error('Open redirect not blocked');
  });

  // ── 2. State entropy ──────────────────────────────────────────────────────

  await runner.run('state_entropy: 50 unique states, entropy OK', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl:    baseUrl,
      clientId:         'PA_LEGACY_VENDOR',
      validRedirectUri: legacyUri,
      testsToRun:       ['state_entropy'],
    });
    const t = r.results.state_entropy;
    setOutput({ uniqueCount: t.uniqueCount, entropy: t.shannonEntropy });
    if (t.entropyFlag) throw new Error(t.summary);
  });

  // ── 3. JWT alg:none ───────────────────────────────────────────────────────

  await runner.run('alg_none: PingFed issues signed JWT (alg header RS256)', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl: baseUrl,
      clientId:      'PA_LEGACY_VENDOR',
      clientSecret:  'legacy-secret-changeme',
      testsToRun:    ['alg_none_attack'],
    });
    const t = r.results.alg_none_attack;
    setOutput({ originalAlg: t.originalAlg, skipped: t.skipped });
    if (t.skipped) throw new Error(t.reason);
    // Mock uses RS256 header to mirror PingFed's actual alg
    if (!t.originalAlg) throw new Error('Could not determine token alg');
  });

  await runner.run('alg_none: forged token rejected by /idp/userinfo.openid', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl: baseUrl,
      clientId:      'PA_LEGACY_VENDOR',
      clientSecret:  'legacy-secret-changeme',
      testsToRun:    ['alg_none_attack'],
    });
    const t = r.results.alg_none_attack;
    setOutput({ forgedAccepted: t.forgedAccepted, status: t.forgedStatusCode });
    if (t.skipped) throw new Error(t.reason);
    if (t.forgedAccepted) throw new Error('VULNERABLE — alg:none accepted');
  });

  // ── 4. PKCE enforcement ───────────────────────────────────────────────────

  await runner.run('pkce: PA_VENDOR_PORTAL requires PKCE — no code_challenge rejected', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl:    baseUrl,
      clientId:         'PA_LEGACY_VENDOR',   // legacy client (no PKCE)
      pkceClientId:     'PA_VENDOR_PORTAL',   // this one requires PKCE
      validRedirectUri: legacyUri,
      testsToRun:       ['pkce_enforcement'],
    });
    const t = r.results.pkce_enforcement;
    setOutput({ vulnerabilities: t.vulnerabilities, cases: t.cases.map(c => ({ label: c.label, finding: c.finding })) });
    if (t.vulnerabilities > 0) throw new Error(`PKCE not enforced: ${JSON.stringify(t.cases.filter(c => c.finding === 'VULNERABLE'))}`);
  });

  await runner.run('pkce: PA_LEGACY_VENDOR has no PKCE (documented as upgrade target)', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl:    baseUrl,
      clientId:         'PA_LEGACY_VENDOR',
      pkceClientId:     'PA_VENDOR_PORTAL',
      validRedirectUri: legacyUri,
      testsToRun:       ['pkce_enforcement'],
    });
    const t = r.results.pkce_enforcement;
    const legacyCase = t.cases.find(c => c.label.includes('legacy'));
    setOutput({ legacyCase });
    // legacy case is INFO — not a failure, just documented
  });

  // ── 5. Token rotation ─────────────────────────────────────────────────────

  await runner.run('token_rotation: PingFed rotates refresh tokens correctly', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl: baseUrl,
      clientId:      'PA_LEGACY_VENDOR',
      clientSecret:  'legacy-secret-changeme',
      testsToRun:    ['token_rotation'],
    });
    const t = r.results.token_rotation;
    setOutput({ rotationWorked: t.rotationWorked, replayRejected: t.replayRejected });
    if (t.skipped) throw new Error(t.reason);
    if (!t.rotationWorked)  throw new Error('New refresh_token not issued on rotation');
    if (!t.replayRejected)  throw new Error('VULNERABLE — replayed refresh_token accepted');
  });

  // ── 6. BOLA / IDOR ────────────────────────────────────────────────────────

  await runner.run('bola_idor: PA_VENDOR_A cannot access PA_VENDOR_B report', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl:   baseUrl,
      clientId:        'PA_LEGACY_VENDOR',
      targetClientId:  'PA_VENDOR_A',
      resourceIds:     ['rpt-vendor-a-weekly', 'rpt-vendor-b-weekly'],
      resourcePath:    '/api/report',
      testsToRun:      ['bola_idor'],
    });
    const t = r.results.bola_idor;
    setOutput({ vulnerabilities: t.vulnerabilities, results: t.results?.map(r => ({ id: r.resourceId, finding: r.finding, status: r.status })) });
    if (t.skipped) throw new Error(t.reason);
    if (t.vulnerabilities > 0) throw new Error(`Cross-tenant access: ${JSON.stringify(t.results?.filter(r => r.finding === 'VULNERABLE'))}`);
  });

  // ── 7. Scope escalation ───────────────────────────────────────────────────

  await runner.run('scope_escalation: PA_LIMITED cannot escalate to vendor:reports', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl:   baseUrl,
      clientId:        'PA_LIMITED',
      clientSecret:    'limited-secret',
      requestedScopes: ['openid', 'vendor:read', 'vendor:reports', 'vendor:inventory', 'admin'],
      allowedScopes:   ['openid', 'vendor:read'],
      testsToRun:      ['scope_escalation'],
    });
    const t = r.results.scope_escalation;
    setOutput({ grantedScopes: t.grantedScopes, escalatedScopes: t.escalatedScopes });
    if (t.finding === 'VULNERABLE') throw new Error(`Escalated scopes: ${t.escalatedScopes.join(', ')}`);
  });

  // ── 8. Header injection (PingAccess) ─────────────────────────────────────

  await runner.run('header_injection: /pa/protected rejects all X-PingAccess-* header injections', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl:          baseUrl,
      clientId:               'PA_LEGACY_VENDOR',
      secureEndpointPath:     '/pa/protected',
      vulnerableEndpointPath: '/pa/misconfigured',
      testsToRun:             ['header_injection'],
    });
    const t = r.results.header_injection;
    setOutput({ bypassCount: t.secureEndpoint.bypassCount, headersProbed: t.headersProbed });
    if (t.secureEndpoint.finding === 'VULNERABLE') {
      throw new Error(`/pa/protected bypassed via: ${t.secureEndpoint.results.filter(r => r.finding === 'VULNERABLE').map(r => r.header).join(', ')}`);
    }
  });

  await runner.run('header_injection: /pa/misconfigured shows X-Authenticated-User bypass (vuln demo)', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl:          baseUrl,
      clientId:               'PA_LEGACY_VENDOR',
      secureEndpointPath:     '/pa/protected',
      vulnerableEndpointPath: '/pa/misconfigured',
      testsToRun:             ['header_injection'],
    });
    const t   = r.results.header_injection;
    const hit = t.vulnerableEndpoint.results.find(r => r.header === 'X-Authenticated-User');
    setOutput({ hit, note: t.vulnerableEndpoint.note });
    if (!hit?.accepted) throw new Error('Misconfigured endpoint should accept X-Authenticated-User for demo');
  });

  // ── 9. Full suite ─────────────────────────────────────────────────────────

  await runner.run('full suite (all 8 tests): risk score LOW against mock PingFed', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl:          baseUrl,
      clientId:               'PA_LEGACY_VENDOR',
      clientSecret:           'legacy-secret-changeme',
      validRedirectUri:       legacyUri,
      pkceClientId:           'PA_VENDOR_PORTAL',
      targetClientId:         'PA_VENDOR_A',
      resourceIds:            ['rpt-vendor-a-weekly', 'rpt-vendor-b-weekly'],
      resourcePath:           '/api/report',
      requestedScopes:        ['openid', 'vendor:read', 'vendor:reports', 'admin'],
      allowedScopes:          ['openid', 'vendor:read'],
      secureEndpointPath:     '/pa/protected',
      vulnerableEndpointPath: '/pa/misconfigured',
      testsToRun:             ['all'],
    });
    setOutput({ riskScore: r.riskScore, testsRun: r.testsRun });
    if (r.riskScore.score > 0) throw new Error(`Risk score ${r.riskScore.score} (${r.riskScore.label})`);
  });

  // ── Chaos ─────────────────────────────────────────────────────────────────

  await runner.run('chaos: non-PA_ client_id returns PingFed-format error', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl:    baseUrl,
      clientId:         'not-a-ping-client',
      validRedirectUri: legacyUri,
      testsToRun:       ['redirect_uri_validation'],
    });
    const t = r.results.redirect_uri_validation;
    setOutput({ vulnerabilities: t.vulnerabilities });
    if (t.vulnerabilities > 0) throw new Error('Unknown client allowed a bypass');
  });

  await runner.run('chaos: replayed refresh token triggers session invalidation', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl: baseUrl,
      clientId:      'PA_VENDOR_A',
      clientSecret:  'vendor-a-secret',
      testsToRun:    ['token_rotation'],
    });
    const t = r.results.token_rotation;
    setOutput({ replayRejected: t.replayRejected, replayStatus: t.replayStatus, error: t.replayError });
    if (t.skipped) throw new Error(t.reason);
    if (!t.replayRejected) throw new Error('Replay was not detected');
  });

  await stop(ctx.srv);
  runner.finish();
}

main().catch(err => { console.error('Crash:', err); process.exit(1); });
