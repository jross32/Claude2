// tests/unit/captcha-robustness.test.js
// Automated tests for CAPTCHA detection and bypass logic in the scraper

const { _detectCaptcha } = require('../../src/auth');
const assert = require('assert');

describe('CAPTCHA Robustness', () => {
  test('Detects hCaptcha', async () => {
    const result = await _detectCaptcha({
      evaluate: async fn => fn.call({
        document: {
          querySelector: (sel) => sel.includes('h-captcha') ? { getAttribute: () => 'sitekey123' } : null,
          querySelectorAll: () => [],
        },
      }),
    });
    assert.deepStrictEqual(result, { type: 'hcaptcha', sitekey: 'sitekey123' });
  });

  test('Detects reCAPTCHA v2', async () => {
    const result = await _detectCaptcha({
      evaluate: async fn => fn.call({
        document: {
          querySelector: (sel) => sel.includes('g-recaptcha') ? { getAttribute: (attr) => attr === 'data-sitekey' ? 'recaptcha-key' : '' } : null,
          querySelectorAll: () => [],
        },
      }),
    });
    assert.deepStrictEqual(result, { type: 'recaptcha_v2', sitekey: 'recaptcha-key' });
  });

  test('Returns null if no CAPTCHA present', async () => {
    const result = await _detectCaptcha({
      evaluate: async fn => fn.call({
        document: {
          querySelector: () => null,
          querySelectorAll: () => [],
        },
      }),
    });
    assert.strictEqual(result, null);
  });
});
