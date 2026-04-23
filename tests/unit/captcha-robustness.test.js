const { TestRunner } = require('../runner');
const { _detectCaptcha } = require('../../src/auth');

function createCaptchaPage(documentStub, windowStub = {}) {
  return {
    evaluate: async (fn) => {
      const previousDocument = global.document;
      const previousWindow = global.window;

      global.document = documentStub;
      global.window = windowStub;
      try {
        return fn();
      } finally {
        global.document = previousDocument;
        global.window = previousWindow;
      }
    },
  };
}

async function main() {
  const runner = new TestRunner('unit');

  await runner.run('Detects hCaptcha widgets and extracts the sitekey', async ({ setOutput }) => {
    const result = await _detectCaptcha(createCaptchaPage({
      querySelector: (selector) => selector.includes('.h-captcha')
        ? { getAttribute: () => 'sitekey123' }
        : null,
      querySelectorAll: () => [],
    }));

    if (JSON.stringify(result) !== JSON.stringify({ type: 'hcaptcha', sitekey: 'sitekey123' })) {
      throw new Error(`Unexpected hCaptcha detection result: ${JSON.stringify(result)}`);
    }

    setOutput(result);
  });

  await runner.run('Detects reCAPTCHA v2 widgets and extracts the sitekey', async ({ setOutput }) => {
    const result = await _detectCaptcha(createCaptchaPage({
      querySelector: (selector) => selector.includes('.g-recaptcha')
        ? {
            getAttribute: (attr) => {
              if (attr === 'data-sitekey') return 'recaptcha-key';
              if (attr === 'data-size') return '';
              return null;
            },
          }
        : null,
      querySelectorAll: () => [],
    }));

    if (JSON.stringify(result) !== JSON.stringify({ type: 'recaptcha_v2', sitekey: 'recaptcha-key' })) {
      throw new Error(`Unexpected reCAPTCHA detection result: ${JSON.stringify(result)}`);
    }

    setOutput(result);
  });

  await runner.run('Returns null when no CAPTCHA widget is present', async ({ setOutput }) => {
    const result = await _detectCaptcha(createCaptchaPage({
      querySelector: () => null,
      querySelectorAll: () => [],
    }));

    if (result !== null) throw new Error(`Expected null result, got ${JSON.stringify(result)}`);
    setOutput({ detected: false });
  });

  const result = runner.finish();
  process.exit(result.summary.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test runner crashed:', err.message);
  process.exit(1);
});
