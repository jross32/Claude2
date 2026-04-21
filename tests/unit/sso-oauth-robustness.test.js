// tests/unit/sso-oauth-robustness.test.js
// Automated tests for SSO/OAuth detection logic in the scraper

const { _findOAuthButton } = require('../../src/auth');
const assert = require('assert');

async function main() {
  // Detects Google OAuth button
  let fakePage = {
    $$(selector) {
      const arr = [
        {
          isVisible: async () => true,
          textContent: async () => 'Sign in with Google',
          getAttribute: async (attr) => attr === 'href' ? 'https://accounts.google.com/o/oauth2/auth' : '',
        },
      ];
      arr.catch = () => arr; // Add .catch to array to match Playwright API
      return arr;
    },
  };
  let result = await _findOAuthButton(fakePage, 'google');
  assert(result && result.provider === 'Google', 'Should detect Google OAuth');

  // Detects SSO button
  fakePage = {
    $$(selector) {
      return [
        {
          isVisible: async () => true,
          textContent: async () => 'Enterprise SSO',
          getAttribute: async (attr) => attr === 'href' ? '/sso/login' : '',
        },
      ];
    },
  };
  result = await _findOAuthButton(fakePage, 'sso');
  assert(result && result.provider === 'SSO', 'Should detect SSO button');

  // Returns null if no OAuth/SSO button
  fakePage = { $$(selector) { return []; } };
  result = await _findOAuthButton(fakePage, 'github');
  assert.strictEqual(result, null);
  console.log('sso-oauth-robustness: all tests passed');
}

if (require.main === module) main();
