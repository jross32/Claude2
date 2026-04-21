// tests/unit/captcha-robustness.test.js
// Automated tests for CAPTCHA detection and bypass logic in the scraper

const { _detectCaptcha } = require('../../src/auth');
const assert = require('assert');

async function main() {
  // Detects hCaptcha
  let result = await _detectCaptcha({
    evaluate: async fn => fn.call({
      document: {
        querySelector: (sel) => sel.includes('h-captcha') ? { getAttribute: () => 'sitekey123' } : null,
        querySelectorAll: () => [],
      },
      window: {},
    }),
  });
  assert.deepStrictEqual(result, { type: 'hcaptcha', sitekey: 'sitekey123' });

  // Detects reCAPTCHA v2
  result = await _detectCaptcha({
    evaluate: async fn => fn.call({
      document: {
        querySelector: (sel) => sel.includes('g-recaptcha') ? { getAttribute: (attr) => attr === 'data-sitekey' ? 'recaptcha-key' : '' } : null,
        querySelectorAll: () => [],
      },
      window: {},
    }),
  });
  assert.deepStrictEqual(result, { type: 'recaptcha_v2', sitekey: 'recaptcha-key' });

  // Returns null if no CAPTCHA present
  result = await _detectCaptcha({
    evaluate: async fn => fn.call({
      document: {
        querySelector: () => null,
        querySelectorAll: () => [],
      },
      window: {},
    }),
  });
  assert.strictEqual(result, null);
  console.log('captcha-robustness: all tests passed');
}

if (require.main === module) main();
