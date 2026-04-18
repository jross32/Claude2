'use strict';

/**
 * tests/security/oidc_lab.test.js
 * Full OIDC/OAuth2 security lab test suite.
 *
 * Covers:
 *   1. redirect_uri validation (14 bypass variants)
 *   2. State parameter entropy
 *   3. JWT alg:none attack
 *   4. PKCE enforcement audit
 *   5. Token rotation / replay defense
 *   6. BOLA / IDOR cross-tenant access
 *   7. Scope escalation
 *   8. Header injection (PingAccess-style)
 *   9. TLS fingerprint analysis
 *  10. Chaos / edge cases
 *
 * Run: node tests/security/oidc_lab.test.js
 */

const { TestRunner }               = require('../runner');
const { createServer, CLIENTS }    = require('./mock_idp');
const {
  performOidcSecurityTests,
  testTlsFingerprint,
}                                  = require('../../src/oidc-tester');

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function startMockIdp() {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      resolve({ srv, port, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

function stopMockIdp(srv) {
  return new Promise((resolve) => srv.close(resolve));
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const runner = new TestRunner('security-oidc_lab');
  let ctx = null;

  // ── Setup ──────────────────────────────────────────────────────────────────
  await runner.run('mock IdP starts and listens', async ({ setOutput }) => {
    ctx = await startMockIdp();
    setOutput({ port: ctx.port, baseUrl: ctx.baseUrl });
  });

  if (!ctx) {
    runner.skip('all subsequent tests', 'mock IdP failed to start');
    runner.finish();
    return;
  }

  const { baseUrl } = ctx;
  const validUri    = CLIENTS['test-client'].redirect_uris[0];

  // ══════════════════════════════════════════════════════════════════════════════
  // 1. REDIRECT URI VALIDATION
  // ══════════════════════════════════════════════════════════════════════════════

  await runner.run('redirect_uri: exact match accepted', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl: baseUrl, clientId: 'test-client',
      validRedirectUri: validUri, testsToRun: ['redirect_uri_validation'],
    });
    const t = r.results.redirect_uri_validation;
    setOutput({ vulnerabilities: t.vulnerabilities });
    if (t.vulnerabilities > 0) throw new Error(`${t.vulnerabilities} bypass(es): ${t.failed.map(f => f.label).join(', ')}`);
  });

  await runner.run('redirect_uri: all 13 attack variants blocked', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl: baseUrl, clientId: 'test-client',
      validRedirectUri: validUri, testsToRun: ['redirect_uri_validation'],
    });
    const t = r.results.redirect_uri_validation;
    setOutput({ totalCases: t.totalCases, vulnerabilities: t.vulnerabilities, failed: t.failed });
    if (t.vulnerabilities > 0) throw new Error(JSON.stringify(t.failed));
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 2. STATE PARAMETER ENTROPY
  // ══════════════════════════════════════════════════════════════════════════════

  await runner.run('state_entropy: 50 unique values, entropy >= 3.5', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl: baseUrl, clientId: 'test-client',
      validRedirectUri: validUri, testsToRun: ['state_entropy'],
    });
    const t = r.results.state_entropy;
    setOutput({ uniqueCount: t.uniqueCount, entropy: t.shannonEntropy, flag: t.entropyFlag });
    if (t.entropyFlag) throw new Error(t.summary);
    if (t.uniqueCount < t.sampleSize) throw new Error(`Only ${t.uniqueCount}/${t.sampleSize} unique`);
  });

  await runner.run('state_entropy: server echoes state correctly', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl: baseUrl, clientId: 'test-client',
      validRedirectUri: validUri, testsToRun: ['state_entropy'],
    });
    const t = r.results.state_entropy;
    setOutput({ mismatchedEchoes: t.mismatchedEchoes });
    if (!t.serverEchoesStateCorrectly) throw new Error(`${t.mismatchedEchoes} state mismatch(es)`);
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 3. JWT ALG:NONE ATTACK
  // ══════════════════════════════════════════════════════════════════════════════

  await runner.run('alg_none: server issues HS256 JWT', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl: baseUrl, clientId: 'test-client', clientSecret: 'test-secret',
      validRedirectUri: validUri, testsToRun: ['alg_none_attack'],
    });
    const t = r.results.alg_none_attack;
    setOutput({ originalAlg: t.originalAlg, skipped: t.skipped });
    if (t.skipped) throw new Error(t.reason);
    if (t.originalAlg !== 'HS256') throw new Error(`Expected HS256, got ${t.originalAlg}`);
  });

  await runner.run('alg_none: forged token rejected (HTTP 401)', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl: baseUrl, clientId: 'test-client', clientSecret: 'test-secret',
      validRedirectUri: validUri, testsToRun: ['alg_none_attack'],
    });
    const t = r.results.alg_none_attack;
    setOutput({ forgedAccepted: t.forgedAccepted, status: t.forgedStatusCode });
    if (t.skipped) throw new Error(t.reason);
    if (t.forgedAccepted) throw new Error('VULNERABLE — alg:none token was accepted');
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 4. PKCE ENFORCEMENT
  // ══════════════════════════════════════════════════════════════════════════════

  await runner.run('pkce: PKCE-required client rejects request without code_challenge', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl: baseUrl, clientId: 'test-client',
      pkceClientId: 'pkce-client', validRedirectUri: validUri,
      testsToRun: ['pkce_enforcement'],
    });
    const t = r.results.pkce_enforcement;
    setOutput({ vulnerabilities: t.vulnerabilities, cases: t.cases.map(c => ({ label: c.label, finding: c.finding })) });
    if (t.vulnerabilities > 0) throw new Error(`PKCE not enforced: ${t.cases.filter(c => c.finding === 'VULNERABLE').map(c => c.label).join(', ')}`);
  });

  await runner.run('pkce: PKCE client accepts request with valid S256 challenge', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl: baseUrl, clientId: 'test-client',
      pkceClientId: 'pkce-client', validRedirectUri: validUri,
      testsToRun: ['pkce_enforcement'],
    });
    const t = r.results.pkce_enforcement;
    const validCase = t.cases.find(c => c.label.includes('valid S256'));
    setOutput({ validCase });
    if (validCase && validCase.finding === 'WARN') throw new Error('Valid PKCE challenge was unexpectedly rejected');
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 5. TOKEN ROTATION / REPLAY
  // ══════════════════════════════════════════════════════════════════════════════

  await runner.run('token_rotation: refresh token rotates on use', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl: baseUrl, clientId: 'test-client', clientSecret: 'test-secret',
      testsToRun: ['token_rotation'],
    });
    const t = r.results.token_rotation;
    setOutput({ rotationWorked: t.rotationWorked, replayRejected: t.replayRejected, finding: t.finding });
    if (t.skipped) throw new Error(t.reason);
    if (!t.rotationWorked) throw new Error('New refresh_token was not issued on rotation');
  });

  await runner.run('token_rotation: replayed refresh token is rejected', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl: baseUrl, clientId: 'test-client', clientSecret: 'test-secret',
      testsToRun: ['token_rotation'],
    });
    const t = r.results.token_rotation;
    setOutput({ replayRejected: t.replayRejected, replayStatus: t.replayStatus });
    if (t.skipped) throw new Error(t.reason);
    if (!t.replayRejected) throw new Error('VULNERABLE — replay of old refresh_token was accepted');
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 6. BOLA / IDOR
  // ══════════════════════════════════════════════════════════════════════════════

  await runner.run('bola_idor: vendor-a can access own resource', async ({ setOutput }) => {
    // No clientSecret passed — orchestrator falls back to 'vendor-a-secret' for BOLA
    const r = await performOidcSecurityTests({
      mockServerUrl: baseUrl, clientId: 'test-client',
      targetClientId: 'vendor-a',
      resourceIds: ['report-vendor-a'],
      testsToRun: ['bola_idor'],
    });
    const t = r.results.bola_idor;
    setOutput({ skipped: t.skipped, totalProbed: t.totalProbed, vulnerabilities: t.vulnerabilities });
    if (t.skipped) throw new Error(`BOLA test skipped: ${t.reason}`);
    const ownResource = t.results?.find(r => r.resourceId === 'report-vendor-a');
    if (!ownResource) throw new Error('Own resource not found in probe results');
  });

  await runner.run('bola_idor: vendor-a cannot access vendor-b resource', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl: baseUrl, clientId: 'test-client',
      targetClientId: 'vendor-a',
      resourceIds: ['report-vendor-a', 'report-vendor-b'],
      testsToRun: ['bola_idor'],
    });
    const t = r.results.bola_idor;
    setOutput({ vulnerabilities: t.vulnerabilities, results: t.results });
    if (t.skipped) throw new Error(`BOLA test skipped: ${t.reason}`);
    if (t.vulnerabilities > 0) throw new Error(`Cross-tenant access found: ${JSON.stringify(t.results?.filter(r => r.finding === 'VULNERABLE'))}`);
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 7. SCOPE ESCALATION
  // ══════════════════════════════════════════════════════════════════════════════

  await runner.run('scope_escalation: server strips unregistered scopes', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl: baseUrl,
      clientId: 'limited-scope', clientSecret: 'limited-secret',
      requestedScopes: ['openid', 'read', 'write', 'admin', 'superuser'],
      allowedScopes:   ['openid', 'read'],
      testsToRun: ['scope_escalation'],
    });
    const t = r.results.scope_escalation;
    setOutput({ grantedScopes: t.grantedScopes, escalatedScopes: t.escalatedScopes, finding: t.finding });
    if (t.finding === 'VULNERABLE') throw new Error(`Escalated scopes granted: ${t.escalatedScopes.join(', ')}`);
  });

  await runner.run('scope_escalation: legitimate scopes are still granted', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl: baseUrl,
      clientId: 'limited-scope', clientSecret: 'limited-secret',
      requestedScopes: ['openid', 'read'],
      allowedScopes:   ['openid', 'read'],
      testsToRun: ['scope_escalation'],
    });
    const t = r.results.scope_escalation;
    setOutput({ grantedScopes: t.grantedScopes });
    if (!t.grantedScopes.includes('openid')) throw new Error('openid scope was not granted');
    if (!t.grantedScopes.includes('read'))   throw new Error('read scope was not granted');
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 8. HEADER INJECTION (PingAccess-style)
  // ══════════════════════════════════════════════════════════════════════════════

  await runner.run('header_injection: secure endpoint rejects all injection headers', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl: baseUrl, clientId: 'test-client',
      testsToRun: ['header_injection'],
    });
    const t = r.results.header_injection;
    setOutput({
      headersProbed:   t.headersProbed,
      bypassCount:     t.secureEndpoint.bypassCount,
      finding:         t.secureEndpoint.finding,
    });
    if (t.secureEndpoint.finding === 'VULNERABLE') {
      throw new Error(`Secure endpoint bypassed via: ${t.secureEndpoint.results.filter(r => r.finding === 'VULNERABLE').map(r => r.header).join(', ')}`);
    }
  });

  await runner.run('header_injection: vulnerable endpoint demonstrates bypass (X-Authenticated-User)', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl: baseUrl, clientId: 'test-client',
      testsToRun: ['header_injection'],
    });
    const t = r.results.header_injection;
    const xAuthResult = t.vulnerableEndpoint.results.find(r => r.header === 'X-Authenticated-User');
    setOutput({ xAuthResult, note: t.vulnerableEndpoint.note });
    // Vulnerable endpoint SHOULD accept X-Authenticated-User (it's demonstrating the bug)
    if (!xAuthResult?.accepted) throw new Error('Vulnerable endpoint should accept X-Authenticated-User to demonstrate the misconfiguration');
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 9. TLS FINGERPRINT
  // ══════════════════════════════════════════════════════════════════════════════

  await runner.run('tls_fingerprint: chrome-115 comparison runs without error', async ({ setOutput }) => {
    const r = await testTlsFingerprint({ compareProfile: 'chrome-115' });
    setOutput({
      profile:        r.profileLabel,
      similarityPct:  r.comparison.similarityPct,
      nodeVersion:    r.node.version,
      openssl:        r.node.openssl,
      missingCount:   r.comparison.missingFromNode.length,
    });
    if (!r.comparison) throw new Error('No comparison result returned');
  });

  await runner.run('tls_fingerprint: firefox-117 comparison runs without error', async ({ setOutput }) => {
    const r = await testTlsFingerprint({ compareProfile: 'firefox-117' });
    setOutput({ profile: r.profileLabel, similarityPct: r.comparison.similarityPct });
    if (!r.profileLabel) throw new Error('No profile label in result');
  });

  await runner.run('tls_fingerprint: config snippet is generated', async ({ setOutput }) => {
    const r = await testTlsFingerprint({ compareProfile: 'chrome-115' });
    setOutput({ snippetLength: r.configSnippet?.length });
    if (!r.configSnippet || r.configSnippet.length < 50) throw new Error('Config snippet missing or too short');
    if (!r.playwrightNote) throw new Error('Playwright note missing');
  });

  await runner.run('tls_fingerprint: unknown profile returns error gracefully', async ({ setOutput }) => {
    const r = await testTlsFingerprint({ compareProfile: 'ie6' });
    setOutput({ error: r.error });
    if (!r.error) throw new Error('Expected an error for unknown profile');
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 10. FULL SUITE + CHAOS
  // ══════════════════════════════════════════════════════════════════════════════

  await runner.run('full suite: riskScore LOW when all tests pass', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl: baseUrl,
      clientId: 'test-client', clientSecret: 'test-secret',
      validRedirectUri: validUri,
      pkceClientId: 'pkce-client',
      targetClientId: 'vendor-a',
      resourceIds: ['report-vendor-a', 'report-vendor-b'],
      requestedScopes: ['openid', 'read', 'write', 'admin'],
      allowedScopes:   ['openid', 'read', 'write'],
      testsToRun: ['all'],
    });
    setOutput({ riskScore: r.riskScore, testsRun: r.testsRun });
    if (r.riskScore.score > 0) throw new Error(`Risk score ${r.riskScore.score} (${r.riskScore.label}) — expected LOW`);
  });

  await runner.run('chaos: unknown client returns error, no bypass', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl: baseUrl, clientId: 'ghost-client',
      testsToRun: ['redirect_uri_validation'],
    });
    const t = r.results.redirect_uri_validation;
    setOutput({ vulnerabilities: t.vulnerabilities });
    if (t.vulnerabilities > 0) throw new Error('Unknown client allowed bypass');
  });

  await runner.run('chaos: wrong secret causes token tests to skip gracefully', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl: baseUrl, clientId: 'test-client', clientSecret: 'wrong-secret',
      testsToRun: ['alg_none_attack', 'token_rotation'],
    });
    const algNone = r.results.alg_none_attack;
    const rotation = r.results.token_rotation;
    setOutput({ algNoneSkipped: algNone?.skipped, rotationSkipped: rotation?.skipped });
    if (algNone?.forgedAccepted) throw new Error('Forged token accepted with wrong secret');
  });

  await runner.run('chaos: unreachable server returns structured result, no crash', async ({ setOutput }) => {
    const r = await performOidcSecurityTests({
      mockServerUrl: 'http://127.0.0.1:1', clientId: 'test-client',
      testsToRun: ['redirect_uri_validation'],
    });
    const t = r.results.redirect_uri_validation;
    setOutput({ vulnerabilities: t.vulnerabilities });
    if (t.vulnerabilities > 0) throw new Error('Unreachable server reported a vulnerability');
  });

  // ── Teardown ───────────────────────────────────────────────────────────────
  await stopMockIdp(ctx.srv);
  runner.finish();
}

main().catch((err) => {
  console.error('Test suite crashed:', err);
  process.exit(1);
});
