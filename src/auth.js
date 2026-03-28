/**
 * Authentication handler — fast, no artificial delays.
 */
async function handleAuth(page, options) {
  const { username, password, verificationCode, waitForVerification, log } = options;

  // Fill a field reliably with React/Vue/Angular synthetic events
  async function fill(sel, value) {
    await page.focus(sel);
    await page.fill(sel, value);
    await page.evaluate(([s, v]) => {
      const el = document.querySelector(s);
      if (!el) return;
      const nv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      nv.set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, [sel, value]);
  }

  // Find the first visible matching selector
  async function findVisible(selectors) {
    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (el && await el.isVisible()) return sel;
      } catch {}
    }
    return null;
  }

  // Click submit — skip Forgot Password / Cancel / Register / Back
  async function clickSubmit() {
    const candidates = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button[id*="login" i]',
      'button[id*="signin" i]',
      'button[id*="sign-in" i]',
      'button[id*="continue" i]',
      'button[id*="next" i]',
      '[data-testid*="submit" i]',
      '[data-testid*="login" i]',
      'form button',
    ];
    for (const sel of candidates) {
      try {
        const els = await page.$$(sel);
        for (const el of els) {
          if (!await el.isVisible()) continue;
          const text = (await el.textContent() || '').toLowerCase().trim();
          if (/forgot|reset|cancel|back|register|sign.?up|create/i.test(text)) continue;
          await el.click();
          log(`Submitted via "${text}" (${sel})`);
          return;
        }
      } catch {}
    }
    await page.keyboard.press('Enter');
    log('Submitted via Enter key');
  }

  // ── Fill email ──────────────────────────────────────────────────────────────
  const emailSel = await findVisible([
    'input[type="email"]',
    'input[name="email"]',
    'input[autocomplete="email"]',
    'input[autocomplete="username"]',
    'input[name="username"]',
    'input[id*="email" i]',
    'input[id*="username" i]',
    'input[placeholder*="email" i]',
    'input[placeholder*="username" i]',
    'input[type="text"]',
  ]);

  if (emailSel) {
    await fill(emailSel, username);
    log(`Filled email: ${emailSel}`);
  } else {
    log('Could not find email field', 'warn');
  }

  // ── Fill password ───────────────────────────────────────────────────────────
  const passSel = await findVisible([
    'input[type="password"]',
    'input[name="password"]',
    'input[id*="password" i]',
  ]);

  if (passSel) {
    await fill(passSel, password);
    log(`Filled password: ${passSel}`);
  } else {
    log('Could not find password field', 'warn');
    return;
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  log('Submitting login form...');
  await clickSubmit();
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  log(`Post-login URL: ${page.url()}`);

  // ── Handle "Continue to …" confirmation page ────────────────────────────────
  log('Checking for continue/confirmation page...');
  await clickContinueIfPresent(page, log);
  log(`Post-continue URL: ${page.url()}`);

  // ── Auto-detect 2FA ─────────────────────────────────────────────────────────
  const twoFA = await detectVerificationType(page);
  if (twoFA !== 'none') {
    log(`Auto-detected 2FA: ${twoFA}`);
    await handleVerification(page, { verificationType: twoFA, verificationCode, waitForVerification, log });
  }
}

async function clickContinueIfPresent(page, log) {
  // Text patterns that indicate a "continue forward" button
  const continueTexts = ['continue', 'proceed', 'allow', 'accept', 'go to', 'member services', 'continue to'];

  try {
    // Get all visible buttons and links
    const clickables = await page.$$('button, a, input[type="submit"], input[type="button"]');
    for (const el of clickables) {
      try {
        if (!await el.isVisible()) continue;
        const text = ((await el.textContent()) || '').toLowerCase().trim();
        const val  = ((await el.getAttribute('value')) || '').toLowerCase().trim();
        const combined = text + ' ' + val;
        if (continueTexts.some(t => combined.includes(t))) {
          log(`Clicking continue button: "${text || val}"`);
          await el.click();
          await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
          // Recurse to handle chained continue pages
          await clickContinueIfPresent(page, log);
          return;
        }
      } catch {}
    }
  } catch {}
}

async function detectVerificationType(page) {
  try {
    return await page.evaluate(() => {
      const body = document.body?.innerText?.toLowerCase() || '';
      const hasCodeInput = [...document.querySelectorAll('input')].some(el =>
        el.offsetParent !== null && (
          /otp|code|token|verify|2fa/i.test(el.name + el.id + el.placeholder + (el.autocomplete || '')) ||
          el.autocomplete === 'one-time-code' ||
          (el.type === 'number' && el.maxLength <= 8)
        )
      );
      if (!hasCodeInput) return 'none';
      if (/captcha/i.test(body)) return 'captcha';
      if (/authenticator|totp|google auth/i.test(body)) return 'totp';
      if (/sent.*email|email.*code|check your email/i.test(body)) return 'email';
      if (/sms|text message/i.test(body)) return 'sms';
      return 'totp';
    });
  } catch { return 'none'; }
}

async function handleVerification(page, options) {
  const { verificationType, verificationCode, waitForVerification, log } = options;
  if (verificationType === 'captcha') { log('CAPTCHA — manual intervention required', 'warn'); return; }

  let code = verificationCode;
  if (!code) { code = await waitForVerification(); }
  if (!code) { log('No verification code — skipping', 'warn'); return; }

  const selectors = [
    'input[autocomplete="one-time-code"]',
    'input[name*="code" i]', 'input[name*="otp" i]',
    'input[placeholder*="code" i]',
    'input[type="number"][maxlength="6"]',
    'input[type="tel"][maxlength="6"]',
  ];

  let filled = false;
  for (const sel of selectors) {
    try {
      await page.waitForSelector(sel, { timeout: 5000 });
      await page.fill(sel, code.toString());
      filled = true;
      break;
    } catch {}
  }
  if (!filled) {
    await page.evaluate((c) => {
      const el = [...document.querySelectorAll('input')].find(i => i.offsetParent !== null);
      if (el) { el.value = c; el.dispatchEvent(new Event('input', { bubbles: true })); }
    }, code.toString());
  }

  await page.keyboard.press('Enter');
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  log('Verification submitted');
}

module.exports = { handleAuth };
