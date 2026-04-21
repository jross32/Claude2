// tests/unit/2fa-mfa-robustness.test.js
// Automated tests for 2FA/MFA detection and bypass logic in the scraper

const { handleAuth, handleVerification } = require('../../src/auth');
const { chromium } = require('playwright');
const assert = require('assert');

async function run2FATest({ page, type, secret, code, expectBypass }) {
  let bypassed = false;
  await handleAuth(page, {
    username: 'testuser',
    password: 'testpass',
    verificationCode: code,
    totpSecret: secret,
    waitForVerification: async () => code,
    log: (msg, level) => {
      if (msg && msg.toString().includes('Auto-generated TOTP code')) bypassed = true;
    },
  });
  assert.strictEqual(bypassed, expectBypass, `2FA bypass for ${type} failed`);
}

async function main() {
  // Mock page object for TOTP bypass
  // TOTP auto-generation
  const totpPage = {
    waitForSelector: async () => {},
    fill: async () => {},
    keyboard: { press: async () => {} },
    waitForLoadState: async () => {},
    evaluate: async () => {},
    url: () => 'https://example.com',
  };
  await run2FATest({ page: totpPage, type: 'totp', secret: 'JBSWY3DPEHPK3PXP', code: null, expectBypass: true });

  // Manual code entry (email/SMS)
  const emailPage = {
    waitForSelector: async () => {},
    fill: async () => {},
    keyboard: { press: async () => {} },
    waitForLoadState: async () => {},
    evaluate: async () => {},
    url: () => 'https://example.com',
  };
  await run2FATest({ page: emailPage, type: 'email', secret: null, code: '123456', expectBypass: false });

  // Graceful failure with no code
  let error = null;
  const nonePage = {
    waitForSelector: async () => {},
    fill: async () => {},
    keyboard: { press: async () => {} },
    waitForLoadState: async () => {},
    evaluate: async () => {},
    url: () => 'https://example.com',
  };
  try {
    await run2FATest({ page: nonePage, type: 'none', secret: null, code: null, expectBypass: false });
  } catch (e) { error = e; }
  assert(error, 'Should throw error if no code provided');
  console.log('2fa-mfa-robustness: all tests passed');
}

if (require.main === module) main();
