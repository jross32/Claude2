// tests/unit/sso-oauth-robustness.test.js
// Automated tests for SSO/OAuth detection logic in the scraper

const { _findOAuthButton } = require('../../src/auth');
const assert = require('assert');

describe('SSO/OAuth Robustness', () => {
  test('Detects Google OAuth button', async () => {
    const fakePage = {
      $$(selector) {
        return [
          {
            isVisible: async () => true,
            textContent: async () => 'Sign in with Google',
            getAttribute: async (attr) => attr === 'href' ? 'https://accounts.google.com/o/oauth2/auth' : '',
          },
        ];
      },
    };
    const result = await _findOAuthButton(fakePage, 'google');
    assert(result && result.provider === 'Google', 'Should detect Google OAuth');
  });

  test('Detects SSO button', async () => {
    const fakePage = {
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
    const result = await _findOAuthButton(fakePage, 'sso');
    assert(result && result.provider === 'SSO', 'Should detect SSO button');
  });

  test('Returns null if no OAuth/SSO button', async () => {
    const fakePage = { $$(selector) { return []; } };
    const result = await _findOAuthButton(fakePage, 'github');
    assert.strictEqual(result, null);
  });
});
