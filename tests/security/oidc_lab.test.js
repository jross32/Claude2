'use strict';

/**
 * tests/security/oidc_lab.test.js
 * OIDC/OAuth2 security lab test suite.
 *
 * Spins up the mock IdP on a random port, runs all three tests
 * (redirect_uri_validation, state_entropy, alg_none_attack) plus chaos cases,
 * then tears down the server.
 *
 * Run: node tests/security/oidc_lab.test.js
 */

const { TestRunner }              = require('../runner');
const { createServer, CLIENTS }   = require('./mock_idp');
const { performOidcSecurityTests } = require('../../src/oidc-tester');

// ─── SERVER LIFECYCLE ─────────────────────────────────────────────────────────

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
  const clientId    = 'test-client';
  const secret      = CLIENTS['test-client'].secret;
  const validUri    = CLIENTS['test-client'].redirect_uris[0];

  // ── redirect_uri validation ────────────────────────────────────────────────

  await runner.run('exact-match redirect_uri is accepted', async ({ setOutput }) => {
    const result = await performOidcSecurityTests({
      mockServerUrl:    baseUrl,
      clientId,
      validRedirectUri: validUri,
      testsToRun:       ['redirect_uri_validation'],
    });
    const t = result.results.redirect_uri_validation;
    setOutput({ summary: t.summary, vulnerabilities: t.vulnerabilities });
    if (t.vulnerabilities > 0) {
      throw new Error(`${t.vulnerabilities} bypass(es) found: ${t.failed.map(f => f.label).join(', ')}`);
    }
  });

  await runner.run('open redirect attempt is blocked', async ({ setOutput }) => {
    // Manually verify the open redirect case is in the blocked list
    const result = await performOidcSecurityTests({
      mockServerUrl:    baseUrl,
      clientId,
      validRedirectUri: validUri,
      testsToRun:       ['redirect_uri_validation'],
    });
    const t = result.results.redirect_uri_validation;
    const openRedirectPassed = t.passed.includes('open redirect — attacker.com');
    setOutput({ passed: t.passed, openRedirectBlocked: openRedirectPassed });
    if (!openRedirectPassed) throw new Error('Open redirect was not blocked by the mock IdP');
  });

  await runner.run('all 13 attack variants are blocked (no bypasses)', async ({ setOutput }) => {
    const result = await performOidcSecurityTests({
      mockServerUrl:    baseUrl,
      clientId,
      validRedirectUri: validUri,
      testsToRun:       ['redirect_uri_validation'],
    });
    const t = result.results.redirect_uri_validation;
    setOutput({ vulnerabilities: t.vulnerabilities, failed: t.failed });
    if (t.vulnerabilities > 0) {
      throw new Error(`Bypasses: ${JSON.stringify(t.failed)}`);
    }
  });

  // ── State entropy ──────────────────────────────────────────────────────────

  await runner.run('state values are unique across 50 requests', async ({ setOutput }) => {
    const result = await performOidcSecurityTests({
      mockServerUrl:    baseUrl,
      clientId,
      validRedirectUri: validUri,
      testsToRun:       ['state_entropy'],
    });
    const t = result.results.state_entropy;
    setOutput({ uniqueCount: t.uniqueCount, sampleSize: t.sampleSize, entropy: t.shannonEntropy });
    if (t.uniqueCount < t.sampleSize) {
      throw new Error(`Only ${t.uniqueCount}/${t.sampleSize} state values were unique`);
    }
  });

  await runner.run('state entropy meets minimum threshold (>= 3.5 bits/char)', async ({ setOutput }) => {
    const result = await performOidcSecurityTests({
      mockServerUrl:    baseUrl,
      clientId,
      validRedirectUri: validUri,
      testsToRun:       ['state_entropy'],
    });
    const t = result.results.state_entropy;
    setOutput({ shannonEntropy: t.shannonEntropy, entropyFlag: t.entropyFlag });
    if (t.entropyFlag) throw new Error(t.summary);
  });

  await runner.run('server echoes state parameter correctly', async ({ setOutput }) => {
    const result = await performOidcSecurityTests({
      mockServerUrl:    baseUrl,
      clientId,
      validRedirectUri: validUri,
      testsToRun:       ['state_entropy'],
    });
    const t = result.results.state_entropy;
    setOutput({ mismatchedEchoes: t.mismatchedEchoes, serverEchoesStateCorrectly: t.serverEchoesStateCorrectly });
    if (!t.serverEchoesStateCorrectly) {
      throw new Error(`${t.mismatchedEchoes} state value(s) were not echoed back correctly`);
    }
  });

  // ── JWT alg:none attack ────────────────────────────────────────────────────

  await runner.run('server issues a valid HS256 JWT', async ({ setOutput }) => {
    const result = await performOidcSecurityTests({
      mockServerUrl:    baseUrl,
      clientId,
      clientSecret:     secret,
      validRedirectUri: validUri,
      testsToRun:       ['alg_none_attack'],
    });
    const t = result.results.alg_none_attack;
    setOutput({ originalAlg: t.originalAlg, skipped: t.skipped });
    if (t.skipped) throw new Error(`Test skipped: ${t.reason}`);
    if (t.originalAlg !== 'HS256') throw new Error(`Expected HS256, got ${t.originalAlg}`);
  });

  await runner.run('forged alg:none JWT is rejected (HTTP 401)', async ({ setOutput }) => {
    const result = await performOidcSecurityTests({
      mockServerUrl:    baseUrl,
      clientId,
      clientSecret:     secret,
      validRedirectUri: validUri,
      testsToRun:       ['alg_none_attack'],
    });
    const t = result.results.alg_none_attack;
    setOutput({ forgedAccepted: t.forgedAccepted, forgedStatusCode: t.forgedStatusCode, finding: t.finding });
    if (t.skipped) throw new Error(`Test skipped: ${t.reason}`);
    if (t.forgedAccepted) throw new Error('VULNERABLE — server accepted alg:none token');
  });

  // ── Full suite run ─────────────────────────────────────────────────────────

  await runner.run('full suite: all three tests pass with risk score LOW', async ({ setOutput }) => {
    const result = await performOidcSecurityTests({
      mockServerUrl:    baseUrl,
      clientId,
      clientSecret:     secret,
      validRedirectUri: validUri,
      testsToRun:       ['all'],
    });
    setOutput({
      riskScore:     result.riskScore,
      testsRun:      result.testsRun,
      redirectVulns: result.results.redirect_uri_validation?.vulnerabilities,
      entropyFlag:   result.results.state_entropy?.entropyFlag,
      algNone:       result.results.alg_none_attack?.finding,
    });
    if (result.riskScore.score > 0) {
      throw new Error(`Risk score ${result.riskScore.score} (${result.riskScore.label}) — expected LOW`);
    }
  });

  // ── Chaos tests ────────────────────────────────────────────────────────────

  await runner.run('chaos: unknown client_id returns error, not bypass', async ({ setOutput }) => {
    const result = await performOidcSecurityTests({
      mockServerUrl:    baseUrl,
      clientId:         'nonexistent-client',
      validRedirectUri: validUri,
      testsToRun:       ['redirect_uri_validation'],
    });
    const t = result.results.redirect_uri_validation;
    setOutput({ summary: t.summary, totalCases: t.totalCases });
    // All cases should be blocked (unknown client rejects everything)
    if (t.vulnerabilities > 0) {
      throw new Error(`Unknown client leaked a bypass: ${JSON.stringify(t.failed)}`);
    }
  });

  await runner.run('chaos: wrong client_secret causes alg:none test to skip gracefully', async ({ setOutput }) => {
    const result = await performOidcSecurityTests({
      mockServerUrl:    baseUrl,
      clientId,
      clientSecret:     'wrong-secret',
      validRedirectUri: validUri,
      testsToRun:       ['alg_none_attack'],
    });
    const t = result.results.alg_none_attack;
    setOutput({ skipped: t.skipped, finding: t.finding });
    // Should skip (can't get a token) — not crash
    if (!t.skipped && t.forgedAccepted) throw new Error('Forged token was accepted with wrong secret');
  });

  await runner.run('chaos: unreachable server returns structured error, not crash', async ({ setOutput }) => {
    const result = await performOidcSecurityTests({
      mockServerUrl:    'http://127.0.0.1:1', // nothing listening there
      clientId:         'test-client',
      validRedirectUri: validUri,
      testsToRun:       ['redirect_uri_validation'],
    });
    const t = result.results.redirect_uri_validation;
    setOutput({ summary: t.summary, vulnerabilities: t.vulnerabilities });
    // Connection errors are treated as blocked — no vulnerabilities reported
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
