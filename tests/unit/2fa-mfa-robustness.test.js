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
    log: (msg, level) => { if (msg && msg.includes('Auto-generated TOTP code')) bypassed = true; },
  });
  assert.strictEqual(bypassed, expectBypass, `2FA bypass for ${type} failed`);
}

describe('2FA/MFA Robustness', () => {
  let browser, page;
  beforeAll(async () => { browser = await chromium.launch(); page = await browser.newPage(); });
  afterAll(async () => { await browser.close(); });

  test('TOTP auto-generation', async () => {
    await run2FATest({ page, type: 'totp', secret: 'JBSWY3DPEHPK3PXP', code: null, expectBypass: true });
  });

  test('Manual code entry (email/SMS)', async () => {
    await run2FATest({ page, type: 'email', secret: null, code: '123456', expectBypass: false });
  });

  test('Graceful failure with no code', async () => {
    let error = null;
    try {
      await run2FATest({ page, type: 'none', secret: null, code: null, expectBypass: false });
    } catch (e) { error = e; }
    expect(error).not.toBeNull();
  });
});
