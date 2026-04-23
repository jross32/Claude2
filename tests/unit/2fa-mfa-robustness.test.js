const { TestRunner } = require('../runner');
const { handleVerification } = require('../../src/auth');

function createVerificationPage() {
  const events = {
    filled: [],
    pressed: [],
    waits: [],
  };

  return {
    page: {
      waitForSelector: async (selector) => { events.waits.push(selector); },
      fill: async (selector, value) => { events.filled.push({ selector, value }); },
      evaluate: async () => {},
      keyboard: {
        press: async (key) => { events.pressed.push(key); },
      },
      waitForLoadState: async () => {},
      url: () => 'https://example.com/verify',
    },
    events,
  };
}

async function main() {
  const runner = new TestRunner('unit');

  await runner.run('TOTP verification auto-generates a code when a secret is provided', async ({ setOutput }) => {
    const { page, events } = createVerificationPage();
    const logs = [];

    await handleVerification(page, {
      verificationType: 'totp',
      verificationCode: null,
      totpSecret: 'JBSWY3DPEHPK3PXP',
      waitForVerification: async () => null,
      log: (message, level) => logs.push({ message, level }),
    });

    const generated = logs.find((entry) => String(entry.message).includes('Auto-generated TOTP code'));
    if (!generated) throw new Error('Expected TOTP auto-generation log');
    if (events.filled.length !== 1) throw new Error(`Expected one fill call, got ${events.filled.length}`);
    if (!/^\d{6}$/.test(events.filled[0].value)) throw new Error(`Expected a 6-digit code, got ${events.filled[0].value}`);
    if (!events.pressed.includes('Enter')) throw new Error('Expected Enter key submission');

    setOutput({ code: events.filled[0].value });
  });

  await runner.run('Manual verification codes are submitted without auto-generation', async ({ setOutput }) => {
    const { page, events } = createVerificationPage();
    const logs = [];

    await handleVerification(page, {
      verificationType: 'email',
      verificationCode: '123456',
      totpSecret: null,
      waitForVerification: async () => null,
      log: (message, level) => logs.push({ message, level }),
    });

    if (logs.some((entry) => String(entry.message).includes('Auto-generated TOTP code'))) {
      throw new Error('Did not expect TOTP auto-generation for manual code entry');
    }
    if (events.filled[0]?.value !== '123456') throw new Error(`Expected manual code to be submitted, got ${events.filled[0]?.value}`);

    setOutput({ submitted: events.filled[0].value });
  });

  await runner.run('Missing verification codes log a warning and skip submission gracefully', async ({ setOutput }) => {
    const { page, events } = createVerificationPage();
    const logs = [];

    await handleVerification(page, {
      verificationType: 'sms',
      verificationCode: null,
      totpSecret: null,
      waitForVerification: async () => null,
      log: (message, level) => logs.push({ message, level }),
    });

    if (!logs.some((entry) => String(entry.message).includes('No verification code'))) {
      throw new Error('Expected missing-code warning');
    }
    if (events.filled.length !== 0) throw new Error('Did not expect any code to be submitted');
    if (events.pressed.length !== 0) throw new Error('Did not expect Enter to be pressed');

    setOutput({ warnings: logs.length });
  });

  const result = runner.finish();
  process.exit(result.summary.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test runner crashed:', err.message);
  process.exit(1);
});
